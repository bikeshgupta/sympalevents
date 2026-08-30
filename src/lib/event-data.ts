import { useQuery } from "@tanstack/react-query";
import { budgetRows, contributionRows, demoEvent, demoFinancials, sponsorRows, taskRows } from "@/data/demo";
import { useEventContext } from "@/lib/event-context";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type DataSource = "supabase" | "demo";

export type AppEvent = {
  id?: string;
  name: string;
  dates: string;
  location: string;
};

export type ContributionRow = {
  id?: string;
  residentId?: string;
  flat: string;
  name: string;
  type: string;
  expected: number;
  received: number;
  status: string;
  mode: string;
};

export type SponsorRow = {
  id?: string;
  name: string;
  flat: string;
  contact: string;
  category: string;
  item: string;
  committed: number;
  received: number;
  status: string;
  inKind: boolean;
};

export type BudgetRow = {
  id?: string;
  category: string;
  item: string;
  qty: number;
  unit: string;
  unitCost: number;
  actual: number;
};

export type TaskRow = {
  id?: string;
  task: string;
  owner: string;
  priority: string;
  due: string;
  status: string;
};

type EventData = {
  source: DataSource;
  event: AppEvent;
  financials: typeof demoFinancials;
  contributions: ContributionRow[];
  sponsors: SponsorRow[];
  budgets: BudgetRow[];
  tasks: TaskRow[];
};

const demoData: EventData = {
  source: "demo",
  event: demoEvent,
  financials: demoFinancials,
  contributions: contributionRows,
  sponsors: sponsorRows,
  budgets: budgetRows,
  tasks: taskRows,
};

export async function getFirstEventId() {
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("events")
    .select("id")
    .order("start_date", { ascending: true })
    .limit(1)
    .single();

  if (error) throw error;
  return data.id as string;
}

function dateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const formatter = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (startDate === endDate) return formatter.format(start);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function useEventData() {
  const { selectedEventId } = useEventContext();

  return useQuery({
    queryKey: ["event-data", selectedEventId],
    initialData: demoData,
    queryFn: async (): Promise<EventData> => {
      if (!isSupabaseConfigured || !supabase) return demoData;

      let eventQuery = supabase
        .from("events")
        .select("id,name,start_date,end_date,location")
        .order("start_date", { ascending: true });

      if (selectedEventId) {
        eventQuery = eventQuery.eq("id", selectedEventId);
      }

      const { data: events, error: eventError } = await eventQuery.limit(1);

      if (eventError || !events?.length) {
        console.warn("Falling back to demo data:", eventError?.message ?? "No events found");
        return demoData;
      }

      const eventRecord = events[0];
      const eventId = eventRecord.id;

      const [residentsResult, contributionsResult, sponsorsResult, budgetsResult, expensesResult, tasksResult] =
        await Promise.all([
          supabase.from("residents").select("id,flat_no,resident_name,resident_type").eq("event_id", eventId),
          supabase
            .from("contributions")
            .select("id,expected_amount,received_amount,payment_mode,status,resident_id")
            .eq("event_id", eventId),
          supabase
            .from("sponsors")
            .select("id,sponsor_name,flat_no,contact,category,item_slot,committed_amount,received_amount,status,is_in_kind")
            .eq("event_id", eventId),
          supabase
            .from("budgets")
            .select("id,category,item,estimated_qty,unit,unit_cost,actual_cost")
            .eq("event_id", eventId),
          supabase.from("expenses").select("amount").eq("event_id", eventId),
          supabase.from("tasks").select("id,task,owner_name,priority,due_date,status").eq("event_id", eventId),
        ]);

      const queryError =
        residentsResult.error ??
        contributionsResult.error ??
        sponsorsResult.error ??
        budgetsResult.error ??
        expensesResult.error ??
        tasksResult.error;

      if (queryError) {
        console.warn("Falling back to demo data:", queryError.message);
        return demoData;
      }

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
          status: row.status ?? "Pending",
          mode: row.payment_mode ?? "-",
        };
      });

      const sponsors = (sponsorsResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.sponsor_name ?? "-",
        flat: row.flat_no ?? "",
        contact: row.contact ?? "",
        category: row.category ?? "-",
        item: row.item_slot ?? "",
        committed: Number(row.committed_amount ?? 0),
        received: Number(row.received_amount ?? 0),
        status: row.status ?? "Pending",
        inKind: Boolean(row.is_in_kind),
      }));

      const budgets = (budgetsResult.data ?? []).map((row) => ({
        id: row.id,
        category: row.category ?? "-",
        item: row.item ?? "-",
        qty: Number(row.estimated_qty ?? 0),
        unit: row.unit ?? "",
        unitCost: Number(row.unit_cost ?? 0),
        actual: Number(row.actual_cost ?? 0),
      }));

      const tasks = (tasksResult.data ?? []).map((row) => ({
        id: row.id,
        task: row.task ?? "-",
        owner: row.owner_name ?? "-",
        priority: row.priority ?? "Medium",
        due: row.due_date ?? "-",
        status: row.status ?? "Not Started",
      }));

      const totalBudget = budgets.reduce((sum, row) => sum + row.qty * row.unitCost, 0);
      const actualExpenses = (expensesResult.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      const contributionExpected = contributions.reduce((sum, row) => sum + row.expected, 0);
      const contributionReceived = contributions.reduce((sum, row) => sum + row.received, 0);
      const sponsorshipCommitted = sponsors.reduce((sum, row) => sum + row.committed, 0);
      const sponsorshipReceived = sponsors.reduce((sum, row) => sum + row.received, 0);

      return {
        source: "supabase",
        event: {
          id: eventRecord.id,
          name: eventRecord.name,
          dates: dateRange(eventRecord.start_date, eventRecord.end_date),
          location: eventRecord.location ?? "",
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
      };
    },
  });
}
