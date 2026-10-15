import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCount } from "./format";
import type { ChartPoint } from "./platform-helpers";

/**
 * One measure over the reporting window, against the same-length window before it.
 *
 * The current period is the solid teal mark; the previous period is a thin dashed grey line on the same axis, so
 * the comparison never competes with the figure it explains. One axis only. Hover (or focus) shows both values;
 * "Table" shows every value as text, so nothing is reachable only by pointing.
 */
export function TrendChart({
  points,
  kind = "line",
  name,
  previousName = "Previous period",
  format = formatCount,
  height = 240,
}: {
  points: ChartPoint[];
  kind?: "line" | "bar";
  name: string;
  previousName?: string;
  format?: (value: number) => string;
  height?: number;
}) {
  const [asTable, setAsTable] = useState(false);
  const hasPrevious = points.some((point) => point.previous !== null);
  const untracked = points.filter((point) => point.current === null).length;

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={kind === "bar" ? "h-2.5 w-2.5 rounded-sm bg-primary" : "h-0.5 w-4 rounded bg-primary"} />
            {name}
          </span>
          {hasPrevious ? (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-muted-foreground/60" />
              {previousName}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setAsTable((value) => !value)}
          className="min-h-9 rounded-lg border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {asTable ? "Chart" : "Table"}
        </button>
      </div>

      {untracked ? (
        <p className="mb-2 text-xs text-muted-foreground">
          {untracked} of {points.length} points fall before tracking began. They are left blank, not counted as zero.
        </p>
      ) : null}
      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Day</th>
                <th className="px-3 py-2 text-right font-semibold">{name}</th>
                {hasPrevious ? <th className="px-3 py-2 text-right font-semibold">{previousName}</th> : null}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.tip} className="border-t border-border/70">
                  <td className="px-3 py-1.5">{point.tip}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.current === null ? "Not tracked" : format(point.current)}</td>
                  {hasPrevious ? <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{point.previous === null ? "Not tracked" : format(point.previous)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${name}: ${points.length} points from ${points[0]?.tip ?? ""} to ${points[points.length - 1]?.tip ?? ""}. Use Table for the values.`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} minTickGap={24} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(value: number) => format(value)} />
              <Tooltip cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.35, fill: "hsl(var(--muted))", fillOpacity: 0.4 }} content={<ChartTip name={name} previousName={previousName} format={format} />} />
              {kind === "bar" ? (
                <Bar dataKey="current" name={name} fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              ) : (
                <Line type="monotone" dataKey="current" name={name} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--background))" }} isAnimationActive={false} />
              )}
              {hasPrevious ? (
                <Line type="monotone" dataKey="previous" name={previousName} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

type TipProps = { active?: boolean; payload?: { payload: ChartPoint }[]; name: string; previousName: string; format: (value: number) => string };

function ChartTip({ active, payload, name, previousName, format }: TipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-muted-foreground">{point.tip}</p>
      <p className="flex items-center justify-between gap-6">
        <span>{name}</span>
        <span className="text-sm font-semibold tabular-nums">{point.current === null ? "Not tracked" : format(point.current)}</span>
      </p>
      {point.previous !== null ? (
        <p className="flex items-center justify-between gap-6 text-muted-foreground">
          <span>{previousName}</span>
          <span className="tabular-nums">{format(point.previous)}</span>
        </p>
      ) : null}
    </div>
  );
}
