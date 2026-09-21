import { useQuery } from "@tanstack/react-query";
import {
  budgetRows,
  contributionRows,
  demoEvent,
  demoFinancials,
  eventPlanRows,
  expenseRows,
  sponsorRows,
  taskRows,
} from "@/data/demo";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { isSupabaseConfigured } from "@/lib/supabase";

export type DataSource = "supabase" | "demo";

export type AppEvent = {
  id?: string;
  name: string;
  dates: string;
  location: string;
  startDate: string;
  endDate: string;
  timezone: string;
  heroImageUrl?: string | null;
  status?: string;
};

export type ContributionRow = {
  id?: string;
  residentId?: string;
  flat: string;
  name: string;
  type: string;
  expected: number;
  received: number;
  paymentDate: string;
  status: string;
  mode: string;
  reference: string;
  /** Row creation timestamp, used to show the newest entries first. */
  createdAt: string;
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
  /**
   * When the sponsorship money came in. The column has always existed but the
   * sponsors form never asked for it, so on a live event this is usually blank
   * - which is why `createdAt` is read alongside it as a fallback. Both are
   * here for the Contributions collection timeline; nothing renders them as a
   * column.
   */
  paymentDate: string;
  /** Row creation timestamp - the timeline's fallback date for a sponsor. */
  createdAt: string;
};

export type BudgetRow = {
  id?: string;
  category: string;
  item: string;
  qty: number;
  unit: string;
  unitCost: number;
  actual: number;
  fundingType: string;
  status: string;
};

export type TaskRow = {
  id?: string;
  task: string;
  owner: string;
  priority: string;
  due: string;
  status: string;
};

export type ExpenseRow = {
  id?: string;
  date: string;
  category: string;
  item: string;
  amount: number;
  paidBy: string;
  mode: string;
  type: string;
  sponsored: boolean;
  approvedBy: string;
  notes: string;
};

export type EventPlanRow = {
  id?: string;
  day: string;
  date: string;
  activity: string;
  subEvents: string;
  startTime: string;
  endTime: string;
  location: string;
  attendance: number;
  owner: string;
  status: string;
  notes: string;
};


type EventData = {
  source: DataSource;
  fallbackReason?: string;
  event: AppEvent;
  financials: typeof demoFinancials;
  contributions: ContributionRow[];
  sponsors: SponsorRow[];
  budgets: BudgetRow[];
  tasks: TaskRow[];
  expenses: ExpenseRow[];
  eventPlan: EventPlanRow[];
};

type UseEventDataOptions = {
  includeTasks?: boolean;
};

const demoData: EventData = {
  source: "demo",
  event: demoEvent,
  financials: demoFinancials,
  contributions: contributionRows,
  sponsors: sponsorRows,
  budgets: budgetRows,
  tasks: taskRows,
  expenses: expenseRows,
  eventPlan: eventPlanRows,
};

function eventDataWithTaskPolicy(data: EventData, includeTasks: boolean): EventData {
  return includeTasks ? data : { ...data, tasks: [] };
}

/**
 * The event a write should land on when the calling page has no selection in
 * hand. It asks the server for the events this person is actually a member of
 * - it used to be `select id from events order by start_date limit 1` against
 * the browser client, which on a shared deployment is "the earliest event in
 * the entire database", belonging to whichever society signed up first.
 */
export async function getFirstEventId() {
  const { events } = await apiFetch<{ events: { id: string }[] }>("/api/events?resource=mine");
  if (!events.length) {
    throw new Error("You are not a member of any event yet. Ask an admin to add you, or create one in Settings.");
  }
  return events[0].id;
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

/** What `GET /api/events?resource=data` returns. The server does the reading,
 *  the joining and the per-page privacy; this shape is already display-ready
 *  apart from the two locale-dependent bits added below. */
type EventDataResponse = {
  event: {
    id: string;
    name: string;
    location: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  financials: EventData["financials"];
  contributions: ContributionRow[];
  sponsors: SponsorRow[];
  budgets: BudgetRow[];
  tasks: TaskRow[];
  expenses: ExpenseRow[];
  eventPlan: EventPlanRow[];
};

/**
 * The single read path for screen data.
 *
 * It goes through `/api/events?resource=data` rather than the browser's
 * Supabase client. That is not a refactor for tidiness: every RLS policy here
 * is written against `auth.uid()`, which never resolves for a Firebase
 * session, so the browser could only ever read through a policy that ignored
 * who was asking - and the one it read through ignored which *event* was being
 * asked about too. See api/_lib/event-data.ts.
 *
 * `requireAuth: false` because a public dashboard must still load for somebody
 * with no account; the token is attached when there is one, and the server
 * decides what comes back.
 */
export function useEventData(options: UseEventDataOptions = {}) {
  const { selectedEventId } = useEventContext();
  const includeTasks = options.includeTasks ?? true;

  return useQuery({
    queryKey: ["event-data", selectedEventId, { includeTasks }],
    initialData: eventDataWithTaskPolicy(demoData, includeTasks),
    queryFn: async (): Promise<EventData> => {
      if (!isSupabaseConfigured) {
        return {
          ...eventDataWithTaskPolicy(demoData, includeTasks),
          fallbackReason: "Supabase browser config is missing",
        };
      }

      if (!selectedEventId) {
        return {
          ...eventDataWithTaskPolicy(demoData, includeTasks),
          fallbackReason: "No event selected",
        };
      }

      try {
        const payload = await apiFetch<EventDataResponse>(
          `/api/events?resource=data&eventId=${encodeURIComponent(selectedEventId)}&includeTasks=${includeTasks}`,
          { requireAuth: false },
        );

        return {
          source: "supabase",
          event: {
            id: payload.event.id,
            name: payload.event.name,
            dates: dateRange(payload.event.startDate, payload.event.endDate),
            location: payload.event.location,
            startDate: payload.event.startDate,
            endDate: payload.event.endDate,
            timezone: "Asia/Kolkata",
            heroImageUrl: null,
            status: payload.event.status,
          },
          financials: payload.financials,
          contributions: payload.contributions,
          sponsors: payload.sponsors,
          budgets: payload.budgets,
          tasks: includeTasks ? payload.tasks : [],
          expenses: payload.expenses,
          eventPlan: payload.eventPlan,
        };
      } catch (error) {
        const fallbackReason = error instanceof Error ? error.message : "Could not load this event";
        console.warn("Falling back to demo data:", fallbackReason);
        return {
          ...eventDataWithTaskPolicy(demoData, includeTasks),
          fallbackReason,
        };
      }
    },
  });
}
