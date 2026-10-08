import { resolvePageAccess } from "./page-visibility.js";
import { publicationAccess } from "./publication.js";
import { selectDegrading } from "./schema-compat.js";
import { fetchMySocieties } from "./societies.js";
import { fetchSchedule } from "./schedule.js";
import { assertServiceSupabase, optionalAppUser, sendJson } from "./server.js";

/**
 * The composite read behind `GET /api/events?resource=data`, and the caller's
 * own event list behind `?resource=mine`.
 *
 * This is what `useEventData()` used to do from the browser with the anon key,
 * and moving it here is the point. Every RLS policy in this schema is written
 * against `auth.uid()`; the app signs in with Firebase, so the browser's
 * Supabase client never holds a Supabase session and `auth.uid()` is always
 * null. A member-aware policy therefore cannot be written - it would fail
 * closed for the very people who are entitled to the data. That left the
 * browser reading through `can_view_event_page()`, whose first branch is
 * `target_page_key in ('dashboard','budget','expenses')` and ignores the event
 * entirely: any visitor could read the money of EVERY event in the database.
 *
 * Tasks, auctions, prasad, expenses and closing already moved behind the API
 * for exactly this reason. This finishes that migration for the last holdout.
 *
 * Lives under api/_lib/ because Vercel routes every file directly under api/
 * as its own function and this project is at the plan's cap - see CLAUDE.md.
 */

type ApiRequest = {
  method?: string;
  query?: Record<string, unknown>;
  headers: { authorization?: string };
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => { json: (body: unknown) => void };
};

type SupabaseClient = ReturnType<typeof assertServiceSupabase>;

function queryValue(req: ApiRequest, key: string) {
  const raw = req.query?.[key];
  return String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "");
}

/**
 * Every event this caller can reach, newest first, each tagged with the
 * society it belongs to.
 *
 * Two ways in, and they mean different things:
 *   - a role on the event itself (`event_members`) - that is authority;
 *   - membership of the event's society (`organization_members`) - that is
 *     only discovery, and carries no role. What such a person may open is
 *     still decided page by page by the admin's visibility settings.
 *
 * This replaces the browser's unfiltered `select * from events`, which listed
 * every society's events and auto-selected the earliest one in the database.
 * A signed-out visitor gets an empty list rather than an error: they reach a
 * public event by its link (`?eventId=`), not by browsing.
 */
async function handleMine(req: ApiRequest, res: ApiResponse) {
  const supabase = assertServiceSupabase();
  const viewer = await optionalAppUser(req);

  if (!viewer) {
    sendJson(res, 200, { events: [], societies: [] });
    return;
  }

  const [{ data: memberships, error: membershipError }, societies] = await Promise.all([
    supabase.from("event_members").select("event_id,role").eq("user_id", viewer.id),
    fetchMySocieties(supabase, viewer.id),
  ]);

  if (membershipError) throw membershipError;

  const roleByEvent = new Map((memberships ?? []).map((row) => [row.event_id as string, row.role as string]));
  const societyList = societies ?? [];
  const societyIds = societyList.map((society) => society.id);
  const societyById = new Map(societyList.map((society) => [society.id, society]));

  // Either filter alone is a valid way to reach an event, so they are two
  // queries rather than one `or(...)` - PostgREST's `or` across a join and a
  // column is exactly the kind of filter that quietly stops matching.
  let [byMembership, bySociety] = await Promise.all([
    roleByEvent.size
      ? supabase
          .from("events")
          .select("id,name,slug,start_date,end_date,location,organization_id,status_override")
          .in("id", [...roleByEvent.keys()])
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    societyIds.length
      ? supabase
          .from("events")
          .select("id,name,slug,start_date,end_date,location,organization_id,status_override")
          .in("organization_id", societyIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  // `slug` arrives with 029. Until it is run, ask again without it rather than
  // failing the one call every page makes.
  const missingSlug = (error: { code?: string; message?: string } | null) =>
    Boolean(
      error &&
        (["42703", "PGRST204"].includes(error.code ?? "") ||
          error.message?.includes("slug") ||
          error.message?.includes("status_override")),
    );

  if (missingSlug(byMembership.error) || missingSlug(bySociety.error)) {
    const [legacyMembership, legacySociety] = await Promise.all([
      roleByEvent.size
        ? supabase
            .from("events")
            .select("id,name,start_date,end_date,location,organization_id")
            .in("id", [...roleByEvent.keys()])
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      societyIds.length
        ? supabase
            .from("events")
            .select("id,name,start_date,end_date,location,organization_id")
            .in("organization_id", societyIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ]);
    byMembership = legacyMembership as typeof byMembership;
    bySociety = legacySociety as typeof bySociety;
  }

  if (byMembership.error) throw byMembership.error;
  if (bySociety.error) throw bySociety.error;

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(byMembership.data ?? []), ...(bySociety.data ?? [])]) {
    if (row.status_override === "draft" && !(await publicationAccess(String(row.id), viewer.id)).canRead) continue;
    merged.set(String(row.id), row);
  }

  const events = [...merged.values()]
    .map((row) => {
      const society = societyById.get(String(row.organization_id ?? ""));
      return {
        id: row.id as string,
        name: (row.name as string) ?? "",
        start_date: row.start_date as string,
        end_date: row.end_date as string,
        location: (row.location as string) ?? null,
        role: roleByEvent.get(String(row.id)) ?? null,
        // Both halves of the readable address. Null before 029, which is what
        // keeps useEventPath falling back to the id form.
        slug: (row.slug as string | null) ?? null,
        societyId: (row.organization_id as string) ?? null,
        societyName: society?.name ?? null,
        societySlug: society?.slug ?? null,
      };
    })
    .sort((left, right) => String(right.start_date).localeCompare(String(left.start_date)));

  sendJson(res, 200, { events, societies: societyList });
}

/**
 * One event the caller may open, by id. Used when an event reaches somebody
 * through a link rather than through their own membership list - a resident
 * opening a public dashboard, say. Returns 403 rather than the row when the
 * dashboard is not open to them, so a bare id cannot be used to confirm that
 * an event exists.
 */
/**
 * Every column of `events` this payload can use, in the order they arrived.
 * The first six are the schema as it was created; each later one belongs to a
 * migration the committee may not have run yet (024 type and unit label, 026
 * layout, 027 hero image, theme and share token, 029 slug, 031 times and the
 * collections setting). See api/_lib/schema-compat.ts for why a missing one
 * costs only itself.
 */
const eventColumns = [
  "id",
  "name",
  "start_date",
  "end_date",
  "location",
  "status",
  "slug",
  "organization_id",
  "event_type",
  "unit_label",
  "dashboard_layout",
  "hero_image_url",
  "theme",
  "share_token",
  "start_time",
  "end_time",
  "finance_visibility",
  "status_override",
];
const coreEventColumns = ["id", "name", "start_date", "end_date", "location", "status"];

async function loadEvent(supabase: SupabaseClient, eventId: string) {
  // The hero image used to be lost here: one missing column anywhere sent the
  // whole read to a six-column fallback, so a photo that had saved fine was
  // never shown. Each column now stands or falls on its own.
  const result = await selectDegrading("events", eventColumns, coreEventColumns, (select) =>
    supabase.from("events").select(select).eq("id", eventId).maybeSingle(),
  );
  if (result.error) throw result.error;
  return (result.data as Record<string, unknown> | null) ?? null;
}

/** `18:00:00` from a Postgres `time` column -> `18:00`, which is what every
 *  client helper takes. Null stays null: no time means the whole day. */
function clockOrNull(value: unknown) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function denied(message: string, statusCode: number) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

export async function handleEventData(req: ApiRequest, res: ApiResponse) {
  if (queryValue(req, "resource") === "mine") {
    await handleMine(req, res);
    return;
  }

  if (String(req.method) !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const eventId = queryValue(req, "eventId");
  if (!eventId) {
    sendJson(res, 400, { error: "eventId is required" });
    return;
  }

  const supabase = assertServiceSupabase();
  const viewer = await optionalAppUser(req);
  const viewerId = viewer?.id ?? null;
  const includeTasks = queryValue(req, "includeTasks") !== "false";

  // One resolve per page whose data this read can carry. `resolvePageAccess`
  // is the same resolver api/page-access.ts answers the route guard with, so
  // a page hidden in Settings is hidden here too - the server is the only
  // authority, exactly as it is for every other route.
  const [dashboard, contributionsAccess, sponsorsAccess, budgetAccess, expensesAccess, eventPlanAccess, tasksAccess] =
    await Promise.all([
      resolvePageAccess(eventId, viewerId, "dashboard"),
      resolvePageAccess(eventId, viewerId, "contributions"),
      resolvePageAccess(eventId, viewerId, "sponsors"),
      resolvePageAccess(eventId, viewerId, "budget"),
      resolvePageAccess(eventId, viewerId, "expenses"),
      resolvePageAccess(eventId, viewerId, "event-plan"),
      resolvePageAccess(eventId, viewerId, "tasks"),
    ]);

  // The dashboard is the floor. Somebody who cannot open it cannot read the
  // event's shape at all, and every other page in this payload sits above it.
  const mayRead =
    dashboard.canView ||
    contributionsAccess.canView ||
    sponsorsAccess.canView ||
    budgetAccess.canView ||
    expensesAccess.canView ||
    eventPlanAccess.canView;

  if (!mayRead) {
    throw denied(
      viewerId
        ? "You do not have access to this event"
        : "This event is not open to visitors. Sign in with an account that has access.",
      viewerId ? 403 : 401,
    );
  }

  const event = await loadEvent(supabase, eventId);
  if (!event) {
    sendJson(res, 404, { error: "Event not found" });
    return;
  }

  const [residentsResult, contributionsResult, sponsorsResult, budgetsResult, expensesResult, tasksResult, schedule] =
    await Promise.all([
      supabase.from("residents").select("id,flat_no,resident_name,resident_type").eq("event_id", eventId),
      supabase
        .from("contributions")
        .select(
          "id,expected_amount,received_amount,received_date,payment_mode,status,resident_id,reference,created_at",
        )
        .eq("event_id", eventId),
      supabase
        .from("sponsors")
        .select(
          "id,sponsor_name,flat_no,contact,category,item_slot,committed_amount,received_amount,status,is_in_kind,payment_date,created_at",
        )
        .eq("event_id", eventId),
      supabase
        .from("budgets")
        .select("id,category,item,estimated_qty,unit,unit_cost,actual_cost,funding_type,status")
        .eq("event_id", eventId),
      supabase
        .from("expenses")
        .select("id,expense_date,category,item,amount,paid_by,payment_mode,expense_type,sponsored,approved_by,notes")
        .eq("event_id", eventId),
      includeTasks && tasksAccess.canView
        ? supabase.from("tasks").select("id,task,owner_name,priority,due_date,status").eq("event_id", eventId)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
      fetchSchedule(supabase, eventId),
    ]);

  const queryError =
    residentsResult.error ??
    contributionsResult.error ??
    sponsorsResult.error ??
    budgetsResult.error ??
    expensesResult.error ??
    tasksResult.error;

  if (queryError) throw queryError;

  const residentsById = new Map(
    (residentsResult.data ?? []).map((resident) => [
      resident.id,
      {
        flat: resident.flat_no ?? "-",
        name: resident.resident_name ?? "-",
        type: resident.resident_type ?? "-",
      },
    ]),
  );

  // Names, flats, amounts, dates and status travel with a dashboard view - the
  // committee's standing decision to recognise contributors and sponsors by
  // name (see the Privacy section of the UI rules). A payment reference and a
  // sponsor's contact number do not: those are the two fields the rules name
  // as off-limits on a page an admin may have opened to anyone, and the
  // browser-direct read had no way to withhold them.
  const contributions = (contributionsResult.data ?? []).map((row) => {
    const resident = residentsById.get(row.resident_id ?? "");
    return {
      id: row.id,
      residentId: row.resident_id ?? undefined,
      flat: resident?.flat ?? "-",
      name: resident?.name ?? "-",
      type: resident?.type ?? "-",
      expected: Number(row.expected_amount ?? 0),
      received: Number(row.received_amount ?? 0),
      paymentDate: row.received_date ?? "-",
      status: row.status ?? "Pending",
      mode: row.payment_mode ?? "-",
      reference: contributionsAccess.canView ? row.reference ?? "" : "",
      createdAt: row.created_at ?? "",
    };
  });

  const sponsors = (sponsorsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.sponsor_name ?? "-",
    flat: row.flat_no ?? "",
    contact: sponsorsAccess.canView ? row.contact ?? "" : "",
    category: row.category ?? "-",
    item: row.item_slot ?? "",
    committed: Number(row.committed_amount ?? 0),
    received: Number(row.received_amount ?? 0),
    status: row.status ?? "Pending",
    inKind: Boolean(row.is_in_kind),
    paymentDate: row.payment_date ?? "",
    createdAt: row.created_at ?? "",
  }));

  const budgets = (budgetsResult.data ?? []).map((row) => ({
    id: row.id,
    category: row.category ?? "-",
    item: row.item ?? "-",
    qty: Number(row.estimated_qty ?? 0),
    unit: row.unit ?? "",
    unitCost: Number(row.unit_cost ?? 0),
    actual: Number(row.actual_cost ?? 0),
    fundingType: row.funding_type ?? "",
    status: row.status ?? "Planned",
  }));

  const tasks = (tasksResult.data ?? []).map((row) => ({
    id: row.id as string | undefined,
    task: (row.task as string) ?? "-",
    owner: (row.owner_name as string) ?? "-",
    priority: (row.priority as string) ?? "Medium",
    due: (row.due_date as string) ?? "-",
    status: (row.status as string) ?? "Not Started",
  }));

  // The ledger rows are the Expenses page's business. The dashboard only ever
  // needed the total, which is computed below from every row regardless, so
  // withholding the rows here costs the dashboard nothing.
  const expenses = expensesAccess.canView
    ? (expensesResult.data ?? []).map((row) => ({
        id: row.id,
        date: row.expense_date ?? "-",
        category: row.category ?? "-",
        item: row.item ?? "-",
        amount: Number(row.amount ?? 0),
        paidBy: row.paid_by ?? "",
        mode: row.payment_mode ?? "",
        type: row.expense_type ?? "",
        sponsored: Boolean(row.sponsored),
        approvedBy: row.approved_by ?? "",
        notes: row.notes ?? "",
      }))
    : [];

  const eventPlan = (schedule ?? []).map((row) => ({
    id: row.id as string | undefined,
    day: (row.day as string) ?? "",
    date: (row.activity_date as string) ?? "-",
    activity: (row.activity as string) ?? "-",
    subEvents: (row.sub_events as string) ?? "",
    startTime: (row.start_time as string) ?? "",
    endTime: (row.end_time as string) ?? "",
    location: (row.location as string) ?? "",
    attendance: Number(row.expected_attendance ?? 0),
    owner: (row.owner_name as string) ?? "",
    status: (row.status as string) ?? "Planned",
    notes: (row.notes as string) ?? "",
  }));

  const totalBudget = budgets.reduce((sum, row) => sum + row.qty * row.unitCost, 0);
  const actualExpenses = (expensesResult.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const contributionExpected = contributions.reduce((sum, row) => sum + row.expected, 0);
  const contributionReceived = contributions.reduce((sum, row) => sum + row.received, 0);
  const sponsorshipCommitted = sponsors.reduce((sum, row) => sum + row.committed, 0);
  const sponsorshipReceived = sponsors.reduce((sum, row) => sum + row.received, 0);

  // ---- counts-only events ------------------------------------------------
  //
  // A private event, or one with an entry fee, may want to say how many
  // residents took part without saying what they paid or who they are. This is
  // the server withholding the money, not React declining to draw it: hiding
  // a widget leaves every amount in the JSON for anyone who opens the network
  // tab, signed out included.
  //
  // The counts are always sent - they are the point of the mode - and are
  // taken from the full rows BEFORE anything is removed. A contributor is a
  // distinct resident who has actually paid something, so a family paying in
  // three instalments is one and a declined, zero-rupee row is nobody. This is
  // the same definition Society Home uses, so the two never disagree.
  //
  // Who still sees amounts: an event admin (a society admin counts as one),
  // and anyone given an explicit view/edit grant on Contributions or Sponsors
  // in Member Access. "The page happens to be public" is not a grant, which is
  // exactly why resolvePageAccess reports the grant separately. Budget and
  // expenses are NOT collections and keep following their own visibility.
  const countOnly = "finance_visibility" in event && event.finance_visibility === "count_only";
  const hasGrant = (access: { accessLevel: string }) => access.accessLevel === "view" || access.accessLevel === "edit";
  const collectionsHidden =
    countOnly && !dashboard.isAdmin && !hasGrant(contributionsAccess) && !hasGrant(sponsorsAccess);

  const contributorCount = new Set(
    contributions.filter((row) => row.received > 0).map((row) => row.residentId ?? row.id),
  ).size;
  const sponsorCount = sponsors.length;

  // The society's own slug, for the first half of the readable address. A
  // separate small read rather than a join: it is one row, it is cached by the
  // time anybody navigates, and `loadEvent` already has a legacy fallback that
  // a join would complicate.
  let societySlug: string | null = null;
  if ("organization_id" in event && event.organization_id) {
    const { data: societyRow } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", event.organization_id as string)
      .maybeSingle();
    societySlug = (societyRow?.slug as string | null) ?? null;
  }

  sendJson(res, 200, {
    event: {
      id: event.id,
      name: event.name,
      // The two halves of the readable address. Both null before 029, which is
      // what keeps every link falling back to the id form - see
      // src/lib/event-path.ts.
      slug: "slug" in event ? (event.slug as string | null) ?? null : null,
      societySlug,
      location: event.location ?? "",
      startDate: event.start_date,
      endDate: event.end_date,
      // Wall-clock times in the event's own zone, or null for "the whole day"
      // - which is what every event made before 031 means, so none of them
      // changes. See src/lib/event-status.ts for how they are read.
      startTime: "start_time" in event ? clockOrNull(event.start_time) : null,
      endTime: "end_time" in event ? clockOrNull(event.end_time) : null,
      financeVisibility: countOnly ? "count_only" : "full",
      // Whether 031 has been run. Lets Settings say "needs 031" for the time
      // and collections controls instead of offering something that cannot
      // save - a null time reads the same whether the column is absent or
      // simply blank.
      detailsReady: "start_time" in event && "end_time" in event && "finance_visibility" in event,
      status: event.status ?? "planning",
      statusOverride: "status_override" in event ? event.status_override ?? null : null,
      eventType: ("event_type" in event ? (event.event_type as string) : null) ?? "festival",
      // The word this event uses for the unit a person belongs to - "Flat" in
      // a housing society, "Team" in a league. Null means the app's default.
      unitLabel: ("unit_label" in event ? (event.unit_label as string | null) : null) ?? null,
      // The arrangement of the dashboard, or null for "the default for this
      // kind of event" - which is computed, not stored, so an event is never
      // frozen to whatever the defaults were the day it was made.
      dashboardLayout: "dashboard_layout" in event ? event.dashboard_layout ?? null : null,
      heroImageUrl: "hero_image_url" in event ? (event.hero_image_url as string | null) ?? null : null,
      theme: "theme" in event ? (event.theme as string | null) ?? null : null,
      // The share token is a link, not a secret, but it is only useful to
      // somebody who can hand it out - so it travels only for a committee
      // member. A resident reading a public dashboard has no need of it.
      shareToken:
        "share_token" in event && (dashboard.role === "admin" || dashboard.canEdit)
          ? (event.share_token as string | null) ?? null
          : null,
    },
    financials: {
      totalBudget,
      actualExpenses,
      // Zero, not omitted, so nothing downstream has to guess at a missing
      // key - and `collections.hidden` below tells a widget that the zero is
      // "not shown to you", which it must never draw as a real `₹0`.
      contributionExpected: collectionsHidden ? 0 : contributionExpected,
      contributionReceived: collectionsHidden ? 0 : contributionReceived,
      sponsorshipCommitted: collectionsHidden ? 0 : sponsorshipCommitted,
      sponsorshipReceived: collectionsHidden ? 0 : sponsorshipReceived,
    },
    collections: {
      hidden: collectionsHidden,
      contributors: contributorCount,
      sponsors: sponsorCount,
    },
    contributions: collectionsHidden ? [] : contributions,
    sponsors: collectionsHidden ? [] : sponsors,
    budgets,
    tasks,
    expenses,
    eventPlan,
  });
}
