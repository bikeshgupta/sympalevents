import { z } from "zod";
import { audienceKeys, audienceLabels as labels, inSegment, type AudienceKey, type Row } from "./audiences.js";
import { audit } from "./audit.js";
import { resolvePageAccess } from "./page-visibility.js";
import { selectDegrading } from "./schema-compat.js";
import { assertServiceSupabase, getRequestBody, requireAppUser, sendJson } from "./server.js";

/**
 * Writing to residents without rebuilding a list in WhatsApp every time.
 *
 * `GET | POST /api/events?resource=communications` - folded into api/events.ts.
 *
 * ## It does not send anything
 *
 * WhatsApp is where a society's residents already are, and sending *to* them
 * from here would need consent records, an opt-out and a provider. So this
 * writes the message and says who it is for; the organiser copies it into the
 * group. What the app keeps is a record that they did - **intent, not a
 * delivery receipt** - so "who reminded the households about payment, and
 * when" has an answer.
 *
 * ## Audiences
 *
 * Segments of *registered households* (everyone booked, payment pending,
 * payment submitted, food booked, booked but not yet arrived), plus
 * "everyone" for the society group. There is no resident directory in this
 * app, so "households that have not registered yet" is not something it can
 * know and does not pretend to. A segment carries a count and the flat
 * numbers, for an organiser to follow up personally; **a message never names
 * a recipient**, and no name, phone number or payment reference leaves here.
 *
 * ## Who
 *
 * Organisers - an event admin or a committee member - like the command centre.
 * The count each campaign stores is recomputed here, never taken from the
 * request.
 */

type ApiRequest = {
  method?: string;
  query?: Record<string, unknown>;
  headers: { authorization?: string };
  body?: unknown;
};
type ApiResponse = Parameters<typeof sendJson>[0];

const templates = ["registration_reminder", "payment_reminder", "schedule_update", "volunteer_request", "custom"] as const;

function fail(message: string, statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode });
}

async function loadRows(eventId: string): Promise<Row[] | null> {
  const db = assertServiceSupabase();
  const { data, error } = await db
    .from("event_registrations")
    .select("flat,payment_status,food_count,checked_in_count")
    .eq("event_id", eventId)
    .eq("status", "active")
    .limit(5000);
  if (error) return null;
  return (data ?? []) as Row[];
}

function segmentsFrom(rows: Row[] | null) {
  const everyone = { key: "everyone" as AudienceKey, label: labels.everyone, count: null as number | null, flats: [] as string[] };
  if (!rows) return [everyone];
  const built = audienceKeys
    .filter((key) => key !== "everyone")
    .map((key) => {
      const matching = rows.filter((row) => inSegment(key, row));
      const flats = [...new Set(matching.map((row) => row.flat.trim().toUpperCase()))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
      return { key, label: labels[key], count: flats.length, flats: flats.slice(0, 200) };
    });
  return [everyone, ...built];
}

export async function handleCommunications(req: ApiRequest, res: ApiResponse) {
  const eventId = String(req.query?.eventId ?? "");
  if (!z.string().uuid().safeParse(eventId).success) fail("A valid event is required");

  const { appUser } = await requireAppUser(req);
  const db = assertServiceSupabase();

  const dashboard = await resolvePageAccess(eventId, appUser.id, "dashboard");
  if (dashboard.role !== "admin" && dashboard.role !== "committee") {
    fail("Messages are written by the people organising this event", 403);
  }

  const registrationAccess = await resolvePageAccess(eventId, appUser.id, "registration");
  // A segment is a view of the registrations, so it follows who may see those.
  const rows = registrationAccess.canEdit ? await loadRows(eventId) : null;

  if (req.method === "GET") {
    const events = await selectDegrading(
      "events",
      ["id", "name", "start_date", "end_date", "start_time", "end_time", "location"],
      ["id", "name", "start_date", "end_date", "location"],
      (select) => db.from("events").select(select).eq("id", eventId).maybeSingle(),
    );
    if (events.error) throw events.error;

    const settings = registrationAccess.canEdit
      ? await db.from("event_registration_settings").select("payment_instructions,closes_at").eq("event_id", eventId).maybeSingle()
      : { data: null, error: null };

    const history = await db
      .from("communication_campaigns")
      .select("id,template,audience,audience_count,body,channel,created_by,created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(15);
    const historyReady = !history.error;

    const names = new Map<string, string>();
    const authors = [...new Set(((history.data ?? []) as { created_by: string | null }[]).map((row) => row.created_by).filter(Boolean))] as string[];
    if (authors.length) {
      const { data } = await db.from("app_users").select("id,full_name").in("id", authors);
      for (const person of (data ?? []) as { id: string; full_name: string | null }[]) if (person.full_name) names.set(person.id, person.full_name);
    }

    sendJson(res, 200, {
      segments: segmentsFrom(rows),
      historyReady,
      history: ((history.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: row.id,
        template: row.template,
        audience: row.audience,
        audienceCount: row.audience_count,
        body: row.body,
        channel: row.channel,
        createdAt: row.created_at,
        by: names.get(String(row.created_by)) ?? null,
      })),
      context: {
        paymentInstructions: (settings.data as { payment_instructions?: string } | null)?.payment_instructions ?? "",
        closesAt: (settings.data as { closes_at?: string } | null)?.closes_at ?? null,
      },
    });
    return;
  }

  if (req.method !== "POST") fail("Method not allowed", 405);

  const parsed = z
    .object({
      template: z.enum(templates),
      audience: z.enum(audienceKeys),
      body: z.string().trim().min(1).max(4000),
      channel: z.enum(["copy", "share"]).default("copy"),
    })
    .safeParse(await getRequestBody(req));
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const input = parsed.data;

  const count = segmentsFrom(rows).find((segment) => segment.key === input.audience)?.count ?? 0;
  const { data, error } = await db
    .from("communication_campaigns")
    .insert({
      event_id: eventId,
      template: input.template,
      audience: input.audience,
      audience_count: count ?? 0,
      body: input.body,
      channel: input.channel,
      created_by: appUser.id,
    })
    .select("id")
    .single();
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "")) {
      fail("Recording messages needs supabase/migrations/038_communications.sql. Run it, then try again.", 501);
    }
    throw error;
  }

  audit(req as never, {
    action: "create",
    entityType: "communication",
    entityId: (data as { id: string }).id,
    eventId,
    actor: { id: appUser.id },
    summary: `Prepared a ${input.template.replace(/_/g, " ")} for "${labels[input.audience]}"`,
  });
  sendJson(res, 201, { id: (data as { id: string }).id, audienceCount: count ?? 0 });
}
