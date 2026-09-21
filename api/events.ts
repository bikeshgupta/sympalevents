import { handleEventClosing } from "./_lib/closing.js";
import { handleEventData } from "./_lib/event-data.js";
import { handleSocieties } from "./_lib/societies.js";
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

    // An event belongs to a society. When the caller names one, they have to
    // be entitled to add an event to it; when they do not, a society is made
    // for them with the event's own name and they become its admin - which an
    // admin then renames in Settings.
    //
    // This used to insert a throwaway `organizations` row per event, called
    // "<Event> Organization", that nothing ever read again. See 023.
    const societyId = await resolveSociety(supabase, appUser.id, body);

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        organization_id: societyId,
        name: body.eventName,
        start_date: body.startDate,
        end_date: body.endDate,
        location: body.location ?? "",
        description: body.description ?? "",
      })
      .select("id")
      .single();

    if (eventError) throw eventError;

    const { error: memberError } = await supabase.from("event_members").insert({
      event_id: event.id,
      user_id: appUser.id,
      role: "admin",
    });

    if (memberError) throw memberError;

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
