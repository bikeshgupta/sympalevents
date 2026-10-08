import { loadAnnouncements } from "./announcements.js";
import { readEventReadiness } from "./readiness.js";
import { fetchEventModules, resolvePageAccess } from "./page-visibility.js";
import { selectDegrading } from "./schema-compat.js";
import { assertServiceSupabase, requireAppUser, sendJson } from "./server.js";

/**
 * The organiser's command centre: what needs attention on this event, now.
 *
 * `GET /api/events?resource=command&eventId=` - folded into api/events.ts like
 * every resource since the Vercel function cap, with its handler here.
 *
 * ## The question it answers
 *
 * Not "how is everything doing" - the dashboard does that - but "what should I
 * do next". So the payload is three short lists: a handful of **metrics**, the
 * **attention** items ordered by how urgent they are, and a **readiness**
 * checklist for getting the event ready to publish. Every one of them names the
 * page where the thing is fixed.
 *
 * ## Built from what the app already holds
 *
 * Nothing here is new data. It is counts over the registration, task, expense,
 * schedule and announcement tables, taken on the server (tenant-scoped by the
 * event id in every query) so the browser never downloads a ledger to count it.
 *
 * ## Who, and what each of them gets
 *
 * An organiser: an event admin (a society admin counts as one) or a committee
 * member. Within that, **each section follows the access the caller already
 * has to the page it counts** - a member without edit access to Registration
 * gets no payment queue, one who cannot open Tasks gets no overdue count. A
 * section whose module this event does not have is not drawn at all, so a
 * sports meet with no registration gets a command centre with no empty
 * registration boxes in it.
 *
 * ## Degrading
 *
 * Every section is read on its own and a failure - most often a migration that
 * has not been run - leaves that section out rather than failing the page.
 */

type ApiRequest = {
  method?: string;
  query?: Record<string, unknown>;
  headers: { authorization?: string };
};
type ApiResponse = Parameters<typeof sendJson>[0];

export type Severity = "high" | "medium" | "info";

export type AttentionItem = {
  key: string;
  severity: Severity;
  title: string;
  detail?: string;
  /** The button's words, and the page it opens. */
  label: string;
  page: string;
};

export type Metric = {
  key: string;
  label: string;
  value: string;
  note?: string;
  tone: "default" | "warn" | "good";
  page: string;
};

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

/** A section that may be absent: its failure is its own, not the page's. */
async function safe<T>(read: () => PromiseLike<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/** Today in the event's zone, as `yyyy-mm-dd`. */
function todayInEventZone(now = new Date()) {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const rank: Record<Severity, number> = { high: 0, medium: 1, info: 2 };

/** Whole days from now to an instant, rounded up: "closes in 1 day" until it has. */
function daysUntil(iso: string, now = new Date()) {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

export async function handleCommandCentre(req: ApiRequest, res: ApiResponse) {
  if (String(req.method) !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const eventId = String(req.query?.eventId ?? "");
  if (!eventId) fail("eventId is required", 400);

  const { appUser } = await requireAppUser(req);
  const supabase = assertServiceSupabase();

  const dashboard = await resolvePageAccess(eventId, appUser.id, "dashboard");
  if (dashboard.role !== "admin" && dashboard.role !== "committee") {
    fail("The command centre is for the people organising this event", 403);
  }

  const modules = await fetchEventModules(eventId);
  const has = (pageKey: string) => modules[pageKey]?.isEnabled === true;

  const [registrationAccess, tasksAccess, expensesAccess] = await Promise.all([
    resolvePageAccess(eventId, appUser.id, "registration"),
    resolvePageAccess(eventId, appUser.id, "tasks"),
    resolvePageAccess(eventId, appUser.id, "expenses"),
  ]);

  // ---- the event ----------------------------------------------------------
  const eventResult = await selectDegrading(
    "events",
    ["id", "name", "start_date", "end_date", "start_time", "end_time", "location", "status_override", "hero_image_url", "template_key"],
    ["id", "name", "start_date", "end_date", "location"],
    (select) => supabase.from("events").select(select).eq("id", eventId).maybeSingle(),
  );
  if (eventResult.error) throw eventResult.error;
  const event = eventResult.data as unknown as Record<string, unknown> | null;
  if (!event) fail("Event not found", 404);

  const today = todayInEventZone();

  // ---- sections, each on its own ------------------------------------------
  const registration =
    has("registration") && registrationAccess.canEdit
      ? await safe(async () => {
          const [config, summary, submitted, unpaid, refunds] = await Promise.all([
            supabase.from("event_registration_settings").select("*").eq("event_id", eventId).maybeSingle(),
            supabase.rpc("event_registration_summary", { p_event: eventId }),
            supabase.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "active").eq("payment_status", "submitted"),
            supabase.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "active").eq("payment_status", "unpaid"),
            supabase.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("payment_status", "refund_pending"),
          ]);
          for (const part of [config, summary, submitted, unpaid, refunds]) if (part.error) throw part.error;
          const totals = (summary.data ?? {}) as Record<string, number>;
          return {
            config: (config.data ?? null) as Record<string, unknown> | null,
            attendees: Number(totals.attendees ?? 0),
            households: Number(totals.households ?? 0),
            food: Number(totals.food ?? 0),
            foodServed: Number(totals.foodServed ?? 0),
            checkedIn: Number(totals.checkedIn ?? 0),
            pendingAmount: Number(totals.pendingAmount ?? 0) / 100,
            refundAmount: Number(totals.refundAmount ?? 0) / 100,
            toVerify: submitted.count ?? 0,
            unpaid: unpaid.count ?? 0,
            refunds: refunds.count ?? 0,
          };
        })
      : null;

  const tasks =
    has("tasks") && tasksAccess.canView
      ? await safe(async () => {
          const open = ["Completed", "Cancelled", "Invalid"];
          const [overdue, all] = await Promise.all([
            supabase.from("tasks").select("id", { count: "exact", head: true }).eq("event_id", eventId).lt("due_date", today).not("status", "in", `(${open.join(",")})`),
            supabase.from("tasks").select("id", { count: "exact", head: true }).eq("event_id", eventId).not("status", "in", `(${open.join(",")})`),
          ]);
          if (overdue.error) throw overdue.error;
          if (all.error) throw all.error;
          return { overdue: overdue.count ?? 0, open: all.count ?? 0 };
        })
      : null;

  const claims =
    has("expenses") && expensesAccess.canEdit
      ? await safe(async () => {
          const { data, error } = await supabase.from("expenses").select("amount").eq("event_id", eventId).eq("reimbursement_status", "pending");
          if (error) throw error;
          const rows = (data ?? []) as { amount: number | string }[];
          return { count: rows.length, amount: rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) };
        })
      : null;

  const programme = has("event-plan")
    ? await safe(async () => {
        const { count, error } = await supabase.from("event_schedule").select("id", { count: "exact", head: true }).eq("event_id", eventId);
        if (error) throw error;
        return { items: count ?? 0 };
      })
    : null;

  const posts = await loadAnnouncements(supabase, eventId, dashboard.canEdit);
  const drafts = posts.filter((post) => post.status === "draft").length;

  const waiting = dashboard.canEdit
    ? await safe(async () => {
        const { count, error } = await supabase
          .from("announcement_questions")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("status", "pending");
        if (error) throw error;
        return count ?? 0;
      })
    : null;

  // ---- attention ----------------------------------------------------------
  const attention: AttentionItem[] = [];
  const add = (item: AttentionItem) => attention.push(item);
  const isDraft = event.status_override === "draft";
  const isCancelled = event.status_override === "cancelled";

  if (isDraft) {
    add({
      key: "draft",
      severity: "high",
      title: "This event is still a draft",
      detail: "Residents cannot see it until you publish it from the event page.",
      label: "Open the event page",
      page: "dashboard",
    });
  }

  if (registration) {
    if (registration.toVerify > 0) {
      add({
        key: "verify",
        severity: "high",
        title: `${plural(registration.toVerify, "payment")} need${registration.toVerify === 1 ? "s" : ""} verification`,
        detail: "Check each against your bank or UPI statement, then confirm it.",
        label: "Open registrations",
        page: "registration",
      });
    }

    const cfg = registration.config;
    const closesAt = typeof cfg?.closes_at === "string" ? cfg.closes_at : null;
    if (cfg?.enabled === true && closesAt && !isDraft && !isCancelled) {
      const days = daysUntil(closesAt);
      if (days >= 0 && days <= 3) {
        add({
          key: "closing",
          severity: "medium",
          title: days <= 1 ? "Registration closes tomorrow" : `Registration closes in ${days} days`,
          detail: registration.unpaid ? `${plural(registration.unpaid, "household")} still to pay.` : undefined,
          label: "Open registrations",
          page: "registration",
        });
      }
    }

    if (registration.unpaid > 0) {
      add({
        key: "unpaid",
        severity: "medium",
        title: `${plural(registration.unpaid, "household")} ${registration.unpaid === 1 ? "has" : "have"} not paid`,
        detail: registration.pendingAmount > 0 ? `₹${Math.round(registration.pendingAmount).toLocaleString("en-IN")} outstanding.` : undefined,
        label: "Open registrations",
        page: "registration",
      });
    }

    if (registration.refunds > 0) {
      add({
        key: "refunds",
        severity: "medium",
        title: `${plural(registration.refunds, "refund")} to review`,
        detail: registration.refundAmount > 0 ? `₹${Math.round(registration.refundAmount).toLocaleString("en-IN")} to return.` : undefined,
        label: "Open registrations",
        page: "registration",
      });
    }

    const capacity = typeof cfg?.capacity === "number" ? cfg.capacity : null;
    if (capacity && registration.attendees >= capacity * 0.9) {
      add({
        key: "capacity",
        severity: "info",
        title: registration.attendees >= capacity ? "Registration is full" : "Registration is nearly full",
        detail: `${registration.attendees} of ${capacity} places taken.`,
        label: "Open registrations",
        page: "registration",
      });
    }
  }

  if (tasks && tasks.overdue > 0) {
    add({
      key: "tasks",
      severity: "high",
      title: `${plural(tasks.overdue, "task")} ${tasks.overdue === 1 ? "is" : "are"} overdue`,
      label: "Review tasks",
      page: "tasks",
    });
  }

  if (claims && claims.count > 0) {
    add({
      key: "claims",
      severity: "medium",
      title: `${plural(claims.count, "expense claim")} to reimburse`,
      detail: claims.amount > 0 ? `₹${Math.round(claims.amount).toLocaleString("en-IN")} owed to committee members.` : undefined,
      label: "Open expenses",
      page: "expenses",
    });
  }

  if (waiting && waiting > 0) {
    add({
      key: "questions",
      severity: "medium",
      title: `${plural(waiting, "question")} waiting for you`,
      detail: "Residents asked something. Nothing shows publicly until you approve or answer it.",
      label: "Open announcements",
      page: "dashboard",
    });
  }

  if (drafts > 0 && dashboard.canEdit) {
    add({
      key: "drafts",
      severity: "info",
      title: `${plural(drafts, "announcement")} ${drafts === 1 ? "is a draft" : "are drafts"}`,
      label: "Review drafts",
      page: "dashboard",
    });
  }

  attention.sort((a, b) => rank[a.severity] - rank[b.severity]);

  // ---- metrics ------------------------------------------------------------
  const metrics: Metric[] = [];
  if (registration) {
    metrics.push({
      key: "registered",
      label: "Registered",
      value: String(registration.attendees),
      note: registration.households ? plural(registration.households, "household") : undefined,
      tone: "default",
      page: "registration",
    });
    if (registration.toVerify + registration.unpaid > 0 || registration.pendingAmount > 0) {
      metrics.push({
        key: "awaiting",
        label: "Awaiting payment",
        value: String(registration.toVerify + registration.unpaid),
        note: registration.pendingAmount > 0 ? `₹${Math.round(registration.pendingAmount).toLocaleString("en-IN")} pending` : undefined,
        tone: registration.toVerify + registration.unpaid > 0 ? "warn" : "default",
        page: "registration",
      });
    }
    if (registration.food > 0) {
      metrics.push({
        key: "food",
        label: "Food portions",
        value: String(registration.food),
        note: registration.foodServed ? `${registration.foodServed} served` : undefined,
        tone: "default",
        page: "registration",
      });
    }
    if (registration.checkedIn > 0) {
      metrics.push({ key: "checkedin", label: "Checked in", value: `${registration.checkedIn} / ${registration.attendees}`, tone: "good", page: "registration" });
    }
  }
  if (tasks) {
    metrics.push({
      key: "overdue",
      label: "Tasks overdue",
      value: String(tasks.overdue),
      note: tasks.open ? `${tasks.open} open` : undefined,
      tone: tasks.overdue > 0 ? "warn" : "good",
      page: "tasks",
    });
  }
  if (claims && claims.count > 0) {
    metrics.push({ key: "claims", label: "Claims to pay", value: String(claims.count), note: `₹${Math.round(claims.amount).toLocaleString("en-IN")}`, tone: "warn", page: "expenses" });
  }
  if (programme) {
    metrics.push({ key: "programme", label: "Programme items", value: String(programme.items), tone: "default", page: "event-plan" });
  }

  // ---- readiness ----------------------------------------------------------
  // One answer, shared with publishing - see api/_lib/readiness.ts.
  const readiness = await readEventReadiness(supabase, eventId);

  sendJson(res, 200, {
    event: {
      id: eventId,
      name: String(event.name ?? ""),
      startDate: String(event.start_date ?? ""),
      endDate: String(event.end_date ?? ""),
      startTime: (event.start_time as string | null) ?? null,
      endTime: (event.end_time as string | null) ?? null,
      statusOverride: isDraft ? "draft" : isCancelled ? "cancelled" : null,
    },
    metrics: metrics.slice(0, 4),
    attention,
    readiness,
  });
}
