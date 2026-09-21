import { toEventZoneTimestamp } from "@/features/dashboard/dashboard-utils";
import type { ContributionRow, SponsorRow } from "@/lib/event-data";

/**
 * How the money came in, day by day: resident contributions and sponsorships
 * on the same running total, so the committee can look at any date and ask
 * "where were we, and how far off the budget?".
 *
 * Deliberately free of `recharts` - the chart that draws this is lazy-loaded
 * (~385KB), and the Contributions page needs the numbers to render its
 * selected-day panel and its empty state without waiting for that chunk.
 */

/** A day on which money actually arrived, carrying the running totals up to it. */
export type CollectionPoint = {
  /** ISO `yyyy-mm-dd`, in the event's zone. */
  date: string;
  /**
   * Midnight IST in milliseconds - the chart's x value. A numeric axis draws
   * the gap between two collection days to scale; a categorical one would
   * space a week apart the same as a day apart, which is not what happened.
   */
  t: number;
  /** Arrived on this day. */
  contributionsOnDay: number;
  sponsorsOnDay: number;
  /** Everything up to and including this day. */
  contributions: number;
  sponsors: number;
  total: number;
};

export type CollectionSeries = {
  points: CollectionPoint[];
  /**
   * Money that is in the page's totals but carries no usable date, so it is on
   * no point either. Surfaced rather than quietly dropped - a chart that ends
   * below the "Received" tile with no explanation reads as a bug.
   */
  undated: number;
  undatedRows: number;
};

/** The running state as of one date, against the event's budget. */
export type CollectionDayState = {
  date: string;
  /** Collected on this exact date - zero on a date where nothing came in. */
  contributionsOnDay: number;
  sponsorsOnDay: number;
  onDay: number;
  /** Collected up to and including this date. */
  contributions: number;
  sponsors: number;
  total: number;
  /** Budget minus `total`: positive is still to raise, negative is a surplus. */
  shortfall: number;
  percentOfBudget: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An ISO day from a stored date or timestamp, or null. Both columns this reads
 * use "-" or "" as their absent value, and a timestamp's first ten characters
 * are already the day.
 */
function collectionDate(value: string | null | undefined) {
  if (!value) return null;
  const date = value.slice(0, 10);
  return ISO_DATE.test(date) ? date : null;
}

/**
 * A sponsor's date. `payment_date` is the truth when it is set, but the
 * sponsors form has never asked for one, so on a live event it is blank and
 * the day the sponsorship was recorded is the closest honest answer. Without
 * the fallback the sponsor half of this chart would be empty for everybody.
 */
function sponsorDate(row: SponsorRow) {
  return collectionDate(row.paymentDate) ?? collectionDate(row.createdAt);
}

export function buildCollectionSeries(
  contributions: ContributionRow[],
  sponsors: SponsorRow[],
): CollectionSeries {
  const byDate = new Map<string, { contributions: number; sponsors: number }>();
  let undated = 0;
  let undatedRows = 0;

  function add(date: string | null, amount: number, key: "contributions" | "sponsors") {
    if (!(amount > 0)) return;
    if (!date) {
      undated += amount;
      undatedRows += 1;
      return;
    }
    const day = byDate.get(date) ?? { contributions: 0, sponsors: 0 };
    day[key] += amount;
    byDate.set(date, day);
  }

  for (const row of contributions) add(collectionDate(row.paymentDate), row.received, "contributions");
  for (const row of sponsors) add(sponsorDate(row), row.received, "sponsors");

  const points: CollectionPoint[] = [];
  let contributionsTotal = 0;
  let sponsorsTotal = 0;

  // ISO dates sort correctly as strings, which is the whole reason they are
  // kept in that shape rather than parsed here.
  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date)!;
    contributionsTotal += day.contributions;
    sponsorsTotal += day.sponsors;
    points.push({
      date,
      t: toEventZoneTimestamp(date),
      contributionsOnDay: day.contributions,
      sponsorsOnDay: day.sponsors,
      contributions: contributionsTotal,
      sponsors: sponsorsTotal,
      total: contributionsTotal + sponsorsTotal,
    });
  }

  return { points, undated, undatedRows };
}

/**
 * The state of the collection on `date`: the last point on or before it, plus
 * what arrived on that exact day. A date before the first rupee came in is a
 * real answer (all zeroes), not an absent one.
 */
export function collectionStateOn(
  points: CollectionPoint[],
  date: string,
  totalBudget: number,
): CollectionDayState {
  let running: CollectionPoint | null = null;
  for (const point of points) {
    if (point.date > date) break;
    running = point;
  }

  const onDay = running?.date === date ? running : null;
  const contributions = running?.contributions ?? 0;
  const sponsors = running?.sponsors ?? 0;
  const total = contributions + sponsors;
  const contributionsOnDay = onDay?.contributionsOnDay ?? 0;
  const sponsorsOnDay = onDay?.sponsorsOnDay ?? 0;

  return {
    date,
    contributionsOnDay,
    sponsorsOnDay,
    onDay: contributionsOnDay + sponsorsOnDay,
    contributions,
    sponsors,
    total,
    shortfall: totalBudget - total,
    percentOfBudget: totalBudget > 0 ? Math.round((total / totalBudget) * 100) : 0,
  };
}
