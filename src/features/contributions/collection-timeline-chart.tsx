import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CollectionPoint } from "@/features/contributions/collection-timeline-data";
import {
  formatCurrencyCompact,
  formatEventDate,
  getDateInEventZone,
  toEventZoneTimestamp,
} from "@/features/dashboard/dashboard-utils";
import { formatCurrency } from "@/lib/utils";

/**
 * The drawing half of the collection timeline. Split from the page and
 * lazy-loaded because it is the only thing on Contributions that needs
 * `recharts` (~385KB) - the same boundary `AuctionDetailsPanel` keeps.
 *
 * Two series, and deliberately only two: what has been collected, and what it
 * has to reach. Contributions and sponsorships are one line here because the
 * question this chart answers is "are we going to have enough" - the split
 * between the two is in the figures underneath it.
 */

type ChartPoint = CollectionPoint & { budget: number };
type TooltipPayload = { payload: ChartPoint };

function TimelineTooltip({
  active,
  payload,
  totalBudget,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  totalBudget: number;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const onDay = point.contributionsOnDay + point.sponsorsOnDay;
  const shortfall = totalBudget - point.total;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{formatEventDate(point.date)}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{formatCurrency(point.total)}</p>
      <p className="text-muted-foreground">collected by this day</p>
      {onDay > 0 ? (
        <p className="mt-1 tabular-nums text-muted-foreground">+{formatCurrency(onDay)} on this day</p>
      ) : null}
      {totalBudget > 0 ? (
        <p className="mt-1 tabular-nums text-muted-foreground">
          {shortfall > 0
            ? `${formatCurrency(shortfall)} short of budget`
            : `${formatCurrency(-shortfall)} above budget`}
        </p>
      ) : null}
    </div>
  );
}

export function CollectionTimelineChart({
  points,
  totalBudget,
  selectedDate,
  onSelectDate,
}: {
  points: CollectionPoint[];
  totalBudget: number;
  selectedDate: string;
  /** Clicking a day is a shortcut for the date input the page renders. */
  onSelectDate: (date: string) => void;
}) {
  const latest = points[points.length - 1];
  const showBudget = totalBudget > 0;
  // The budget rides on every point rather than being a `ReferenceLine`, so it
  // is a series in its own right: it gets a legend entry, and the y-axis makes
  // room for it whether or not the collection has come anywhere near it.
  const data: ChartPoint[] = points.map((point) => ({ ...point, budget: totalBudget }));

  return (
    <div
      className="h-48 sm:h-64"
      role="img"
      aria-label={
        `Money collected over time, ` +
        `${formatCurrency(latest.total)} by ${formatEventDate(latest.date)}` +
        (showBudget ? ` against a budget of ${formatCurrency(totalBudget)}.` : ".")
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(state) => {
            const point = (state as unknown as { activePayload?: TooltipPayload[] } | null)?.activePayload?.[0]
              ?.payload;
            if (point) onSelectDate(point.date);
          }}
        >
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            // A time scale picks its own tick positions, which need not land on
            // a collection day - so the day is read back in the event's zone
            // rather than looked up. `toISOString` here would hand anyone west
            // of India the previous day.
            tickFormatter={(value: number) => formatEventDate(getDateInEventZone(new Date(value)))}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            width={56}
            // A little headroom over whichever line is higher, so neither runs
            // along the top edge of its own frame.
            domain={[0, (dataMax: number) => Math.max(dataMax, totalBudget) * 1.08]}
            tickFormatter={formatCurrencyCompact}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<TimelineTooltip totalBudget={totalBudget} />}
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
          />
          <ReferenceLine
            x={toEventZoneTimestamp(selectedDate)}
            stroke="hsl(var(--foreground))"
            strokeWidth={1}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="Collected"
            stroke="hsl(var(--chart-collected))"
            strokeWidth={2}
            fill="hsl(var(--chart-collected))"
            fillOpacity={0.14}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
            isAnimationActive={false}
          />
          {showBudget ? (
            // Flat, because the budget is one planned figure rather than
            // something that accrues - it is the bar the collection is
            // climbing towards, drawn dashed so it never reads as data.
            <Line
              type="linear"
              dataKey="budget"
              name="Budget"
              stroke="hsl(var(--chart-budget))"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
