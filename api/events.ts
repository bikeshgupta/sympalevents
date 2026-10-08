import { z } from "zod";
import { SOCIETY_REGISTRATION_OPEN, societyRegistrationClosedMessage } from "../shared/society-registration.js";
import { handleRegistration, handlePublication } from "./_lib/registration.js";
import { handleEventClosing } from "./_lib/closing.js";
import { handleEventData } from "./_lib/event-data.js";
import { handleAppearance } from "./_lib/appearance.js";
import { handleShareLink } from "./_lib/share.js";
import { handleLedger } from "./_lib/ledger.js";
import { handleResolveEventSlug, handleSocietyHome } from "./_lib/society-home.js";
import { handleDashboardLayout } from "./_lib/layout.js";
import { handleAnnouncements } from "./_lib/announcements.js";
import { handleCommandCentre } from "./_lib/command-centre.js";
import { handleGate } from "./_lib/gate.js";
import { handleOg } from "./_lib/og.js";
import { handleOpportunities } from "./_lib/opportunities.js";
import { handleCommunications } from "./_lib/communications.js";
import { handleDuplicateEvent } from "./_lib/duplicate-event.js";
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
import { audit } from "./_lib/audit.js";

/**
 * Event creation, plus the closing page's three resources and the composite
 * event read, all dispatched by `?resource=` (see api/_lib/closing.ts and
 * api/_lib/event-data.ts for why they live here rather than in files of their
 * own - this project is at the Vercel function cap). A request with no
 * `resource` is the original create-an-event POST.
 */
export default async function handler(req: any, res: any) {
  const resource = String(req.query?.resource ?? "");
  if (resource === "registration" || resource === "publication") {
    try { return await (resource === "registration" ? handleRegistration(req, res) : handlePublication(req, res)); }
    catch (error) { return handleApiError(res, error); }
  }
  // Link previews for crawlers only (vercel.json); serves HTML, not JSON.
  if (resource === "og") return handleOg(req, res);
  if (resource === "opportunities") {
    try { return await handleOpportunities(req, res); }
    catch (error) { return handleApiError(res, error); }
  }
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

  if (resource === "share") {
    try {
      return await handleShareLink(req, res);
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

  // Notices an organiser writes and publishes. Reads ride with the event in
  // `?resource=data`; only the writes need a route - see api/_lib/announcements.ts.
  if (resource === "announcements") {
    try {
      return await handleAnnouncements(req, res);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  // Messages for WhatsApp, and a record that they were prepared.
  if (resource === "communications") {
    try {
      return await handleCommunications(req, res);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  // Run an event again: copy its shape, none of what happened in it.
  if (resource === "duplicate") {
    try {
      return await handleDuplicateEvent(req, res);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  // Event-day entry: search, check in, serve food, walk-ins. See api/_lib/gate.ts.
  if (resource === "gate") {
    try {
      return await handleGate(req, res);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  // The organiser's "what needs attention now". See api/_lib/command-centre.ts.
  if (resource === "command") {
    try {
      return await handleCommandCentre(req, res);
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

  // Society Home's whole payload in one request - see api/_lib/society-home.ts
  // for why the card aggregates are batched rather than fetched per card.
  if (resource === "society-home") {
    try {
      return await handleSocietyHome(req, res);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  // The money pages' writes. They used to go straight from the browser to
  // Supabase with the anon key, which meant nothing could be logged and the
  // last anon write grants had to stay exactly right - see api/_lib/ledger.ts.
  if (resource === "contributions" || resource === "sponsors" || resource === "budgets") {
    try {
      return await handleLedger(req, res, resource);
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  // A readable address resolved to an id. Public, like the share token.
  if (resource === "resolve") {
    try {
      return await handleResolveEventSlug(req, res);
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

    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, "Enter a valid date");
    const parsed = z.object({
      eventName: z.string().trim().min(2).max(100), startDate: date, endDate: date,
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")).optional(),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal("")).optional(),
      societyId: z.string().uuid().optional(), societyName: z.string().trim().min(2).max(80).optional(),
      eventType: z.enum(["festival","sports","cultural","mixed","custom"]), templateKey: z.string().max(40),
      unitLabel: z.string().trim().min(1).max(24),
      location: z.string().trim().max(200).optional(), description: z.string().max(2000).optional(),
      modules: z.array(z.object({pageKey:z.enum(eventPageKeys),visibility:z.enum(["public","authenticated","restricted"]),isEnabled:z.boolean(),labelOverride:z.string().max(28).nullable().optional()})).min(1).max(20),
    }).safeParse(body);
    if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0].message), {statusCode:400});
    const input = parsed.data;
    // Until society registration ships an event can only join a society the person already
    // belongs to as admin or committee (create_event_draft checks that); a new one is refused.
    if (!SOCIETY_REGISTRATION_OPEN && !input.societyId) throw Object.assign(new Error(societyRegistrationClosedMessage),{statusCode:403});
    if (!input.societyId && !input.societyName) throw Object.assign(new Error("Choose a society"),{statusCode:400});
    if (input.endDate < input.startDate || (input.endDate === input.startDate && input.startTime && input.endTime && input.endTime <= input.startTime)) throw Object.assign(new Error("End must be after start"),{statusCode:400});
    const modules = eventPageKeys.map(pageKey => {
      const module = input.modules.find(m=>m.pageKey===pageKey);
      return {page_key:pageKey,visibility:normalizeVisibility(module?.visibility,pageKey),is_enabled:isAlwaysOnPage(pageKey) || Boolean(module?.isEnabled),label_override:cleanModuleLabel(module?.labelOverride)};
    });
    const created = await supabase.rpc("create_event_draft", {p_user:appUser.id,p_input:input,p_modules:modules});
    if (created.error) {
      if (["PGRST202","42883"].includes(created.error.code)) throw Object.assign(new Error("New-event setup is not ready. Apply migrations 032 and 033 before creating events."),{statusCode:503});
      throw created.error;
    }
    audit(req, {action:"create",entityType:"event",entityId:created.data,eventId:created.data,actor:{id:appUser.id},after:{name:input.eventName},summary:"Created a draft event"});
    sendJson(res, 201, {eventId:created.data});
  } catch (error) {
    handleApiError(res, error);
  }
}
