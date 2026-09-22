import { handleEventClosing } from "./_lib/closing.js";
import { handleEventData } from "./_lib/event-data.js";
import { handleAppearance } from "./_lib/appearance.js";
import { handleDashboardLayout } from "./_lib/layout.js";
import { handleSocieties } from "./_lib/societies.js";
import {
  cleanModuleLabel,
  eventPageKeys,
  isAlwaysOnPage,
  normalizeVisibility,
} from "./_lib/page-visibility.js";
import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  sendJson,
} from "./_lib/server.js";

/**
 * Event creation, plus the closing page's three resources and the composite
 * event read, all dispatched by `?resource=` (see api/_lib/closing.ts and
 * api/_lib/event-data.ts for why they live here rather than in files of their
 * own - this project is at the Vercel function cap). A request with no
 * `resource` is the original create-an-event POST.
 */
export default async function handler(req: any, res: any) {
  const resource = String(req.query?.resource ?? "");
  if (resource === "closing" || resource === "gallery" || resource === "feedback") {
    return handleEventClosing(req, res);
  }

  if (resource === "data" || resource === "mine") {
    try {
      return await handleEventData(req, res);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  if (resource === "appearance") {
    try {
      return await handleAppearance(req, res);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  if (resource === "layout") {
    try {
      return await handleDashboardLayout(req, res);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  if (resource === "societies" || resource === "join") {
    try {
      return await handleSocieties(req, res);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);
    const body = await getRequestBody(req);

    await assertUnderCreationCap(supabase, appUser.id);

    // An event belongs to a society. When the caller names one, they have to
    // be entitled to add an event to it; when they do not, a society is made
    // for them with the event's own name and they become its admin - which an
    // admin then renames in Settings.
    //
    // This used to insert a throwaway `organizations` row per event, called
    // "<Event> Organization", that nothing ever read again. See 023.
    const societyId = await resolveSociety(supabase, appUser.id, body);

    const event = await insertEvent(supabase, societyId, body);

    const { error: memberError } = await supabase.from("event_members").insert({
      event_id: event.id,
      user_id: appUser.id,
      role: "admin",
    });

    if (memberError) throw memberError;

    await seedModules(supabase, event.id, body);

    sendJson(res, 201, { eventId: event.id });
  } catch (error) {
    handleApiError(res, error);
  }
}

/**
 * The society a new event should belong to.
 *
 * `societyId` in the body means "add it to this one", and the caller must be
 * that society's admin or committee. Without one, a society is created and the
 * caller becomes its admin, because an event with no society would not appear
 * in anybody's switcher.
 *
 * The membership insert is allowed to fail softly: `organization_members` only
 * takes app_users ids once 023 has been run, and until then an event still has
 * to be creatable. The society row itself has existed since 001.
 */
async function resolveSociety(
  supabase: ReturnType<typeof assertServiceSupabase>,
  userId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const requested = String(body.societyId ?? "");

  if (requested) {
    const { data, error } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", requested)
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && (data?.role === "admin" || data?.role === "committee")) return requested;

    const denied = new Error("You cannot add an event to that society");
    Object.assign(denied, { statusCode: 403 });
    throw denied;
  }

  await assertUnderSocietyCap(supabase, userId);

  const { data: society, error: societyError } = await supabase
    .from("organizations")
    .insert({ name: String(body.societyName ?? body.eventName ?? "New society").slice(0, 80) })
    .select("id")
    .single();

  if (societyError) throw societyError;

  const { error: membershipError } = await supabase
    .from("organization_members")
    .insert({ organization_id: society.id, user_id: userId, role: "admin" });

  if (membershipError) {
    console.warn(
      "Could not record society membership - run supabase/migrations/023_societies.sql. The event was still created.",
      membershipError,
    );
  }

  return society.id as string;
}

/**
 * The event row. `event_type`, `template_key` and `unit_label` arrived with
 * 024, so a project that has not run it still gets an event - it just gets the
 * one shape this app always made.
 */
async function insertEvent(
  supabase: ReturnType<typeof assertServiceSupabase>,
  societyId: string,
  body: Record<string, unknown>,
) {
  const base = {
    organization_id: societyId,
    name: body.eventName,
    start_date: body.startDate,
    end_date: body.endDate,
    location: body.location ?? "",
    description: body.description ?? "",
  };

  const withType = {
    ...base,
    event_type: typeof body.eventType === "string" ? body.eventType : "festival",
    template_key: typeof body.templateKey === "string" ? body.templateKey : null,
    unit_label: typeof body.unitLabel === "string" && body.unitLabel.trim() ? body.unitLabel.trim().slice(0, 24) : null,
  };

  const first = await supabase.from("events").insert(withType).select("id").single();
  if (!first.error) return first.data;

  if (!isMissingEventTypeColumns(first.error)) throw first.error;

  console.warn("events has no template columns. Run supabase/migrations/024_event_modules.sql.");
  const retry = await supabase.from("events").insert(base).select("id").single();
  if (retry.error) throw retry.error;
  return retry.data;
}

function isMissingEventTypeColumns(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (["42703", "PGRST204"].includes(error.code ?? "") ||
        error.message?.includes("event_type") ||
        error.message?.includes("template_key") ||
        error.message?.includes("unit_label")),
  );
}

/**
 * Write the chosen template's modules as this event's own rows.
 *
 * Seeding at creation is the point: until now nothing wrote
 * `event_page_visibility` when an event was made, so every new event fell
 * through to the code defaults and an admin had no idea what it had until they
 * opened Settings. The template is not consulted again after this - these rows
 * are the event's, to edit freely.
 *
 * A failure here never fails the create. An event with no module rows behaves
 * exactly as every event did before this existed, and Settings can fix it.
 */
async function seedModules(
  supabase: ReturnType<typeof assertServiceSupabase>,
  eventId: string,
  body: Record<string, unknown>,
) {
  const submitted = Array.isArray(body.modules) ? (body.modules as Record<string, unknown>[]) : null;
  if (!submitted?.length) return;

  const rows = submitted
    .filter((item) => (eventPageKeys as readonly string[]).includes(String(item.pageKey ?? "")))
    .map((item) => {
      const pageKey = String(item.pageKey);
      return {
        event_id: eventId,
        page_key: pageKey,
        visibility: normalizeVisibility(item.visibility, pageKey),
        is_enabled: isAlwaysOnPage(pageKey) ? true : item.isEnabled !== false,
        label_override: cleanModuleLabel(item.labelOverride),
        updated_at: new Date().toISOString(),
      };
    });

  if (!rows.length) return;

  const { error } = await supabase.from("event_page_visibility").upsert(rows, { onConflict: "event_id,page_key" });
  if (error) {
    console.warn(
      "Could not seed this event's modules - run supabase/migrations/015 and 024. The event was still created.",
      error,
    );
  }
}

/**
 * How much one account may create.
 *
 * Anyone signed in can create an event - that is the point of a shared app,
 * and there is no approval queue to put them through. But nothing bounded it
 * either, and an open create endpoint on a public signup is a way to fill
 * somebody else's database. These numbers are far above what a real committee
 * needs and only exist to stop a script.
 */
const MAX_EVENTS_PER_ADMIN = 40;
const MAX_SOCIETIES_PER_ADMIN = 10;

async function assertUnderCreationCap(supabase: ReturnType<typeof assertServiceSupabase>, userId: string) {
  const { count, error } = await supabase
    .from("event_members")
    .select("event_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "admin");

  // A counting failure must not block a legitimate first event; the cap is a
  // brake, not an authorization check.
  if (error) {
    console.warn("Could not count this account's events; letting the create through.", error);
    return;
  }

  if ((count ?? 0) >= MAX_EVENTS_PER_ADMIN) {
    const denied = new Error(
      `This account already runs ${MAX_EVENTS_PER_ADMIN} events. Ask an admin of the society you want to add to, or close an old event first.`,
    );
    Object.assign(denied, { statusCode: 429 });
    throw denied;
  }
}

async function assertUnderSocietyCap(supabase: ReturnType<typeof assertServiceSupabase>, userId: string) {
  const { count, error } = await supabase
    .from("organization_members")
    .select("organization_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "admin");

  if (error) return;

  if ((count ?? 0) >= MAX_SOCIETIES_PER_ADMIN) {
    const denied = new Error(
      `This account already runs ${MAX_SOCIETIES_PER_ADMIN} societies. Add this event to one of them instead.`,
    );
    Object.assign(denied, { statusCode: 429 });
    throw denied;
  }
}
