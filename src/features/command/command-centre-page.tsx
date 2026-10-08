import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardList,
  Eye,
  ListChecks,
  Megaphone,
  Minus,
  ReceiptIndianRupee,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCommandCentre, type CommandAttention, type CommandReadiness } from "@/lib/command-centre";
import { useEventContext } from "@/lib/event-context";
import { useEventPath } from "@/lib/event-path";
import { eventStartInstant, getEventStatus } from "@/lib/event-status";
import { useViewMode } from "@/lib/view-mode";
import { cn } from "@/lib/utils";

/**
 * Where an organiser starts: what needs attention now.
 *
 * It answers one question - "what should I do next?" - and is deliberately not
 * a second dashboard. The numbers are four at most, the attention list is
 * ordered by how urgent each item is, and every one of them is a link to the
 * page where it is dealt with. The event page (Overview) is still there, as it
 * has always been, for how the event looks to everybody else.
 *
 * Only organisers can open it (the server decides - see page-access), and a
 * section this event or this person has no access to is simply absent rather
 * than drawn empty.
 */

const metricIcons: Record<string, LucideIcon> = {
  registered: Users,
  awaiting: CircleDollarSign,
  food: Utensils,
  checkedin: Check,
  overdue: ListChecks,
  claims: ReceiptIndianRupee,
  programme: CalendarDays,
};

const severityStyle = {
  high: { label: "Urgent", chip: "bg-destructive/10 text-destructive" },
  medium: { label: "Soon", chip: "bg-amber-100 text-amber-900" },
  info: { label: "For info", chip: "bg-muted text-muted-foreground" },
} as const;

export function CommandCentrePage() {
  const { selectedEventId } = useEventContext();
  const path = useEventPath();
  const navigate = useNavigate();
  const view = useViewMode();
  const { data, isLoading, error, refetch, isFetching } = useCommandCentre(selectedEventId);

  // An organiser previewing the resident's view is looking at what a resident
  // sees, and a resident has no command centre to be on.
  if (view.mode === "resident" && !view.isLoading) return <Navigate to={path("/dashboard")} replace />;

  if (isLoading) return <CommandCentreSkeleton />;

  if (error || !data) {
    return (
      <div role="alert" className="mx-auto max-w-5xl space-y-3 rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        <p>{error instanceof Error ? error.message : "Could not load the command centre."}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const { event, metrics, attention, readiness } = data;
  const status = getEventStatus(event);
  const subtitle = statusLine(status, event);

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold sm:text-3xl">Command centre</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.name}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
        <Button asChild className="h-11">
          <Link to={`${path("/dashboard")}?announcements=manage`}>
            <Megaphone className="h-4 w-4" aria-hidden="true" />
            Post an update
          </Link>
        </Button>
      </header>

      {metrics.length ? (
        <StatGrid>
          {metrics.map((metric) => (
            <Link
              key={metric.key}
              to={path(`/${metric.page}`)}
              aria-label={`${metric.label}: ${metric.value}${metric.note ? `, ${metric.note}` : ""}. Open.`}
              className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StatCard
                title={metric.label}
                shortTitle={shortLabel(metric.label)}
                value={metric.value}
                icon={metricIcons[metric.key] ?? ClipboardList}
                note={metric.note}
              />
            </Link>
          ))}
        </StatGrid>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Needs attention</CardTitle>
            <p className="text-sm text-muted-foreground">Most urgent first.</p>
          </CardHeader>
          <CardContent>
            {attention.length ? (
              <ol className="divide-y">
                {attention.map((item, index) => (
                  <AttentionRow key={item.key} item={item} index={index + 1} href={path(`/${item.page}`)} />
                ))}
              </ol>
            ) : (
              <p className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                Nothing needs attention right now.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Event readiness</CardTitle>
            <p className="text-sm text-muted-foreground">What residents need in place.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y">
              {readiness.items.map((item) => (
                <ReadinessRow key={item.key} item={item} href={item.page ? path(`/${item.page}`) : undefined} />
              ))}
            </ul>

            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{readiness.percent}% ready</span>
                {isFetching ? <span className="text-xs text-muted-foreground">Refreshing…</span> : null}
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={readiness.percent}
                aria-label="Event readiness"
                className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${readiness.percent}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-11">
          <Link to={path("/dashboard")}>
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Open the event page
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => {
            view.setPreview(true);
            navigate(path("/dashboard"));
          }}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview resident view
        </Button>
      </div>
    </div>
  );
}

function AttentionRow({ item, index, href }: { item: CommandAttention; index: number; href: string }) {
  const style = severityStyle[item.severity];
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold tabular-nums text-primary"
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", style.chip)}>{style.label}</span>
          <p className="font-medium leading-snug">{item.title}</p>
        </div>
        {item.detail ? <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p> : null}
        <Link
          to={href}
          className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

function ReadinessRow({ item, href }: { item: CommandReadiness; href?: string }) {
  const Icon = item.status === "complete" ? Check : item.status === "missing" ? AlertCircle : Minus;
  const word = item.status === "complete" ? "Complete" : item.status === "missing" ? "Missing" : "Optional";
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          item.status === "complete" && "bg-emerald-100 text-emerald-800",
          item.status === "missing" && "bg-amber-100 text-amber-900",
          item.status === "optional" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug">{item.label}</span>
        {item.detail ? <span className="block text-xs text-muted-foreground">{item.detail}</span> : null}
      </span>
      <span
        className={cn(
          "shrink-0 text-xs font-medium",
          item.status === "complete" && "text-emerald-800",
          item.status === "missing" && "text-amber-900",
          item.status === "optional" && "text-muted-foreground",
        )}
      >
        {word}
      </span>
    </>
  );

  // Only an item that needs doing is a link: a completed one has nowhere to send you.
  return (
    <li>
      {href && item.status !== "complete" ? (
        <Link to={href} className="flex min-h-11 items-center gap-3 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        <div className="flex min-h-11 items-center gap-3 py-2">{body}</div>
      )}
    </li>
  );
}

function CommandCentreSkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-4" aria-busy="true">
      <div className="h-9 w-64 rounded bg-muted" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-16 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="h-72 rounded-lg bg-muted" />
        <div className="h-72 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

/** A label that still says the same thing in a quarter of a phone. */
function shortLabel(label: string) {
  const short: Record<string, string> = {
    // The number is attendees, so "People" is true of it where "Registered" will not fit.
    Registered: "People",
    "Awaiting payment": "Unpaid",
    "Food portions": "Food",
    "Tasks overdue": "Overdue",
    "Claims to pay": "Claims",
    "Programme items": "Programme",
  };
  return short[label];
}

function statusLine(
  status: ReturnType<typeof getEventStatus>,
  event: { startDate: string; startTime: string | null },
) {
  if (status === "draft") return "Draft - not yet visible to residents";
  if (status === "cancelled") return "Cancelled";
  if (status === "completed") return "Completed";
  if (status === "live") return "Happening now";
  const days = Math.ceil((eventStartInstant(event.startDate, event.startTime) - Date.now()) / 86_400_000);
  return days <= 1 ? "Starts within a day" : `${days} days to go`;
}
