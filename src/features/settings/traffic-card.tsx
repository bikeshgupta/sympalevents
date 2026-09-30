import { AlertTriangle, ChevronDown, Clock, Eye, Users } from "lucide-react";
import { useState } from "react";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { formatEventTimestamp } from "@/features/dashboard/dashboard-utils";
import { useEventContext } from "@/lib/event-context";
import { pageLabels, usePageAccess } from "@/lib/page-access";
import { useEventTraffic, type TrafficVisit } from "@/lib/traffic";
import { cn } from "@/lib/utils";

/**
 * Who is reading what the committee maintains.
 *
 * Collapsed by default, and the query is gated on that: an unopened panel
 * makes no request and runs no timer. Admin only - this is the one table in
 * the app that says who was reading which page, and Settings is admin-only in
 * any case (it is the screen that controls all the others, so it is never
 * configurable).
 *
 * What it will not show, deliberately: no IP address, in any form - the
 * server never stores one. No email, no photograph, no role. A guest is
 * "Guest" plus the coarse device and place their request arrived with. Names
 * appear only for people who signed in, the same rule the closing page's
 * credits follow.
 */
export function TrafficCard() {
  const { selectedEventId } = useEventContext();
  const access = usePageAccess("settings");
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useEventTraffic(selectedEventId, open);

  if (!selectedEventId || access.role !== "admin") return null;

  const liveWindow = data?.liveWindowSeconds ?? 120;
  const liveCutoff = Date.now() - liveWindow * 1000;
  const visits = data?.visits ?? [];
  const live = visits.filter((visit) => new Date(visit.lastSeenAt).getTime() > liveCutoff);
  const earlier = visits.filter((visit) => new Date(visit.lastSeenAt).getTime() <= liveCutoff);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = visits.filter((visit) => new Date(visit.lastSeenAt).getTime() >= startOfToday.getTime());

  // Visits of a few seconds are somebody opening a link and leaving; they
  // would drag an average towards zero and say nothing about how long the
  // people who actually read it stayed.
  const counted = visits.filter((visit) => visit.seconds >= 10);
  const averageSeconds = counted.length
    ? Math.round(counted.reduce((total, visit) => total + visit.seconds, 0) / counted.length)
    : 0;

  const ready = data?.ready !== false;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" aria-hidden />
          <span className="text-lg font-semibold">Traffic</span>
        </span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {open && ready && !isLoading ? `${live.length} here now` : "Who is reading this event"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>

      {open ? (
        <CardContent className="space-y-4 border-t pt-5">
          {!ready ? (
            <p className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Run <code className="font-mono">{data?.migration}</code> in Supabase to start recording
                visits. Nothing is being counted until then.
              </span>
            </p>
          ) : null}

          {error ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not read the traffic for this event."}
            </p>
          ) : null}

          <StatGrid>
            <StatCard
              title="Here now"
              value={isLoading ? "…" : String(live.length)}
              icon={Users}
              isLoading={isLoading}
              note={`Seen in the last ${Math.round(liveWindow / 60)} min`}
            />
            <StatCard
              title="Today"
              value={isLoading ? "…" : String(today.length)}
              icon={Eye}
              isLoading={isLoading}
              note="Visits since midnight"
            />
            <StatCard
              title="Average stay"
              shortTitle="Avg stay"
              value={isLoading ? "…" : formatDurationShort(averageSeconds)}
              valueTitle={formatDuration(averageSeconds)}
              icon={Clock}
              isLoading={isLoading}
              note="Visits over 10 seconds"
            />
          </StatGrid>

          {isLoading ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-11 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : ready && !visits.length ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Nobody has opened this event's pages yet. Share the link from the Share card above and they
              will appear here.
            </p>
          ) : null}

          {live.length ? (
            <section>
              <h3 className="text-sm font-medium">
                Here now{" "}
                <span className="font-normal text-muted-foreground">
                  · seen in the last {Math.round(liveWindow / 60)} minutes
                </span>
              </h3>
              <ul className="mt-2 divide-y rounded-md border">
                {live.map((visit) => (
                  <VisitRow key={visit.id} visit={visit} isLive />
                ))}
              </ul>
            </section>
          ) : null}

          {earlier.length ? (
            <section>
              <h3 className="text-sm font-medium">Earlier</h3>
              <ul className="mt-2 divide-y rounded-md border">
                {earlier.map((visit) => (
                  <VisitRow key={visit.id} visit={visit} isLive={false} />
                ))}
              </ul>
            </section>
          ) : null}

          {data?.byPage.length ? (
            <section>
              <h3 className="text-sm font-medium">Most read</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {data.byPage.slice(0, 8).map((entry) => (
                  <li
                    key={entry.pageKey}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
                  >
                    {pageLabels[entry.pageKey] ?? entry.pageKey}
                    <span className="font-medium tabular-nums">{entry.visits}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {ready && visits.length ? (
            <p className="text-xs text-muted-foreground">
              The last 90 days, up to 100 visits. Signed-in people are named; guests never are, and no IP
              address is recorded for anybody.
            </p>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function VisitRow({ visit, isLive }: { visit: TrafficVisit; isLive: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      <span className="flex items-center gap-1.5 font-medium">
        {/* Colour is never the only signal - the "Here now" heading above says
            what this dot means, and the row still reads without it. */}
        {isLive ? <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> : null}
        {visit.signedIn ? visit.name ?? "Signed in" : "Guest"}
      </span>

      <span className="text-muted-foreground">
        {visit.pageKey ? pageLabels[visit.pageKey] ?? visit.pageKey : "—"}
      </span>

      <span className="tabular-nums text-muted-foreground">{formatDuration(visit.seconds)}</span>
      <span className="tabular-nums text-muted-foreground">
        {visit.pageViews} {visit.pageViews === 1 ? "page" : "pages"}
      </span>

      <span className="ml-auto text-xs text-muted-foreground">
        {isLive ? "now" : formatWhen(visit.lastSeenAt)}
      </span>

      <span className="w-full text-xs text-muted-foreground">
        {describeVisitor(visit)}
      </span>
    </li>
  );
}

/**
 * What can honestly be said about somebody who never signed in: the sort of
 * device they used, their browser, and the country or city their request
 * arrived from. All of it coarse, none of it stored as an address.
 */
function describeVisitor(visit: TrafficVisit) {
  const place = [visit.city, visit.country].filter(Boolean).join(", ");
  const parts = [visit.device, visit.browser, place || null].filter(Boolean);
  if (visit.visitNumber > 1) parts.push(`${ordinal(visit.visitNumber)} visit`);
  return parts.length ? parts.join(" · ") : "Device not reported";
}

function ordinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
}

/**
 * When a visit was last seen. A bare date is no use for something that
 * happened an hour ago - "22 Sept" for this morning reads as old news - so
 * anything inside a day is relative and everything older is the date.
 */
function formatWhen(lastSeenAt: string) {
  const minutes = Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  return formatEventTimestamp(lastSeenAt);
}

/** The tile's version: a quarter of a phone has no room for "12m 33s", and a
 *  whole minute is precise enough for an average. Exact value on `valueTitle`. */
function formatDurationShort(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "45s", "6m 20s", "1h 04m". Never a bare number of seconds past a minute. */
function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
