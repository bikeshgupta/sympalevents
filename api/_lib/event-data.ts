import { resolvePageAccess } from "./page-visibility.js";
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
  const [byMembership, bySociety] = await Promise.all([
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

  if (byMembership.error) throw byMembership.error;
  if (bySociety.error) throw bySociety.error;

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(byMembership.data ?? []), ...(bySociety.data ?? [])]) {
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
        societyId: (row.organization_id as string) ?? null,
        societyName: society?.name ?? null,
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
async function loadEvent(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("events")
    .select("id,name,start_date,end_date,location,status")
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw error;
  return data;
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

  sendJson(res, 200, {
    event: {
      id: event.id,
      name: event.name,
      location: event.location ?? "",
      startDate: event.start_date,
      endDate: event.end_date,
      status: event.status ?? "planning",
    },
    financials: {
      totalBudget,
      actualExpenses,
      contributionExpected,
      contributionReceived,
      sponsorshipCommitted,
      sponsorshipReceived,
    },
    contributions,
    sponsors,
    budgets,
    tasks,
    expenses,
    eventPlan,
  });
}
