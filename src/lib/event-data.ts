import type { Announcement } from "@/data/announcements";
import { toAnnouncement, type AnnouncementPostPayload } from "@/lib/announcement-posts";
import type { GoodToKnow } from "@/lib/good-to-know";
import type { HeroOptions } from "@/lib/hero";
import { useSession } from "@/lib/auth";
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
  /** The event half of the readable address: /society/<s>/events/<slug>.
   *  Null before migration 029, which is what keeps links on the id form. */
  slug?: string | null;
  /** The society half of it. */
  societySlug?: string | null;
  dates: string;
  location: string;
  statusOverride?: "draft" | "cancelled" | null;
  startDate: string;
  endDate: string;
  /** Hours of the first and last day, `HH:MM` on the event's clock. Null or
   *  absent means the whole day - which is every event made before 031. */
  startTime?: string | null;
  endTime?: string | null;
  /** `count_only` withholds contribution and sponsorship amounts from anyone
   *  who is not an admin - the server does it; this is only the setting. */
  financeVisibility?: "full" | "count_only";
  /** Whether migration 031 has been run, so Settings can say so rather than
   *  offer a control that cannot save. */
  detailsReady?: boolean;
  timezone: string;
  heroImageUrl?: string | null;
  /** Focal point, hidden title and subtitle for the hero. Null is "as it has
   *  always been". See src/lib/hero.ts. */
  heroOptions?: HeroOptions | null;
  /** Parking, what to bring, who to ask - written by the organisers. */
  goodToKnow?: GoodToKnow | null;
  status?: string;
  /** festival | sports | cultural | mixed | custom - see migration 024. */
  eventType?: string;
  /** The template it was made from, or null for an event that predates them. */
  templateKey?: string | null;
  /** The word this event uses for a person's unit: Flat, House, Team. */
  unitLabel?: string | null;
  /** The committee's dashboard arrangement, or null for this event type's
   *  default. See src/lib/widgets.ts. */
  dashboardLayout?: unknown;
  /** The colour preset this event wears. See src/lib/themes.ts. */
  theme?: string | null;
  /** The permanent link to this event, for a committee member to hand out. */
  shareToken?: string | null;
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


/**
 * What the collections side of the event looks like to THIS viewer.
 *
 * `hidden` means the server withheld contribution and sponsorship amounts and
 * who gave - the rows are empty and the four collection totals are zero. A zero
 * with `hidden` set is "not shown to you", never a real `₹0`, and nothing may
 * draw it as one. The two counts are always true and always sent; they are the
 * point of a counts-only event.
 */
export type CollectionsView = {
  hidden: boolean;
  contributors: number;
  sponsors: number;
};

/** The photographs of the edition this event was copied from. See api/_lib/previous-edition.ts. */
export type PreviousEdition = {
  eventId: string;
  name: string;
  startDate: string;
  photoCount: number;
  photos: { url: string; caption: string }[];
};

type EventData = {
  source: DataSource;
  previousEdition?: PreviousEdition | null;
  /** The event's own announcements. Absent (demo, or a server that predates
   *  them) means "use the committed file", which is empty. */
  announcements?: Announcement[];
  fallbackReason?: string;
  event: AppEvent;
  collections: CollectionsView;
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
  collections: {
    hidden: false,
    contributors: contributionRows.filter((row) => row.received > 0).length,
    sponsors: sponsorRows.length,
  },
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
    slug?: string | null;
    societySlug?: string | null;
    location: string;
    statusOverride?: "draft" | "cancelled" | null;
    startDate: string;
    endDate: string;
    startTime?: string | null;
    endTime?: string | null;
    financeVisibility?: "full" | "count_only";
    detailsReady?: boolean;
    status: string;
    eventType?: string;
    templateKey?: string | null;
    unitLabel?: string | null;
    dashboardLayout?: unknown;
    heroImageUrl?: string | null;
    heroOptions?: HeroOptions | null;
    goodToKnow?: GoodToKnow | null;
    theme?: string | null;
    shareToken?: string | null;
  };
  financials: EventData["financials"];
  announcements?: AnnouncementPostPayload[];
  previousEdition?: PreviousEdition | null;
  /** Absent from a server that predates counts-only events. */
  collections?: CollectionsView;
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
  const {data:session} = useSession();
  const includeTasks = options.includeTasks ?? true;

  return useQuery({
    queryKey: ["event-data", selectedEventId, { includeTasks }, session?.user.appUserId ?? "guest"],
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
            // The two halves of the readable address. The server has always sent
            // them; this read dropped both, so Settings -> Web address could
            // never tell a migrated database from an unmigrated one and showed
            // "run 029" to everybody.
            slug: payload.event.slug ?? null,
            societySlug: payload.event.societySlug ?? null,
            dates: dateRange(payload.event.startDate, payload.event.endDate),
            location: payload.event.location,
            startDate: payload.event.startDate,
            statusOverride: payload.event.statusOverride,
            endDate: payload.event.endDate,
            startTime: payload.event.startTime ?? null,
            endTime: payload.event.endTime ?? null,
            financeVisibility: payload.event.financeVisibility ?? "full",
            detailsReady: payload.event.detailsReady ?? false,
            timezone: "Asia/Kolkata",
            // The event's own photograph when it has one; the bundled image
            // in the dashboard hero is the fallback, not the only option.
            heroImageUrl: payload.event.heroImageUrl ?? null,
            heroOptions: payload.event.heroOptions ?? null,
            goodToKnow: payload.event.goodToKnow ?? null,
            status: payload.event.status,
            eventType: payload.event.eventType ?? "festival",
            templateKey: payload.event.templateKey ?? null,
            unitLabel: payload.event.unitLabel ?? null,
            dashboardLayout: payload.event.dashboardLayout ?? null,
            theme: payload.event.theme ?? null,
            shareToken: payload.event.shareToken ?? null,
          },
          financials: payload.financials,
          // An older server sends none; derive what it would have said.
          collections: payload.collections ?? {
            hidden: false,
            contributors: new Set(
              payload.contributions.filter((row) => row.received > 0).map((row) => row.residentId ?? row.id),
            ).size,
            sponsors: payload.sponsors.length,
          },
          contributions: payload.contributions,
          sponsors: payload.sponsors,
          budgets: payload.budgets,
          tasks: includeTasks ? payload.tasks : [],
          expenses: payload.expenses,
          eventPlan: payload.eventPlan,
          announcements: payload.announcements?.map(toAnnouncement),
          previousEdition: payload.previousEdition ?? null,
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
