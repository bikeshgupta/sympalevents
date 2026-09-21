import {
  Area,
  AreaChart,
  CartesianGrid,
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
 */

type TooltipPayload = { payload: CollectionPoint };

function TimelineTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{formatEventDate(point.date)}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{formatCurrency(point.total)}</p>
      <p className="text-muted-foreground">collected by this day</p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        Contributions {formatCurrency(point.contributions)}
      </p>
      <p className="tabular-nums text-muted-foreground">Sponsors {formatCurrency(point.sponsors)}</p>
      {point.contributionsOnDay + point.sponsorsOnDay > 0 ? (
        <p className="mt-1 tabular-nums text-muted-foreground">
          +{formatCurrency(point.contributionsOnDay + point.sponsorsOnDay)} on this day
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
  // The budget line only belongs on the chart when it is in reach of the axis;
  // an unfunded budget many times the collection would flatten the series into
  // the floor and tell nobody anything.
  const showBudgetLine = totalBudget > 0 && latest.total >= totalBudget * 0.25;

  return (
    <div
      className="h-48 sm:h-64"
      role="img"
      aria-label={
        `Contributions and sponsorships collected over time, ` +
        `${formatCurrency(latest.total)} by ${formatEventDate(latest.date)}` +
        (totalBudget > 0 ? ` against a budget of ${formatCurrency(totalBudget)}.` : ".")
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
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
            // A little headroom over whichever is higher, so the series does
            // not run along the top edge of its own frame.
            domain={[0, (dataMax: number) => Math.max(dataMax, showBudgetLine ? totalBudget : 0) * 1.08]}
            tickFormatter={formatCurrencyCompact}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<TimelineTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
          {showBudgetLine ? (
            <ReferenceLine
              y={totalBudget}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{
                value: `Budget ${formatCurrencyCompact(totalBudget)}`,
                position: "insideTopLeft",
                fontSize: 11,
                fill: "hsl(var(--muted-foreground))",
              }}
            />
          ) : null}
          <ReferenceLine
            x={toEventZoneTimestamp(selectedDate)}
            stroke="hsl(var(--foreground))"
            strokeWidth={1}
          />
          {/* Stacked, so the top edge of the two areas is the total collection. */}
          <Area
            type="monotone"
            dataKey="contributions"
            stackId="collected"
            name="Contributions"
            stroke="hsl(var(--chart-contributions))"
            strokeWidth={2}
            fill="hsl(var(--chart-contributions))"
            fillOpacity={0.18}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="sponsors"
            stackId="collected"
            name="Sponsors"
            stroke="hsl(var(--chart-sponsors))"
            strokeWidth={2}
            fill="hsl(var(--chart-sponsors))"
            fillOpacity={0.18}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
