import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Lock, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, type To } from "react-router-dom";
import { overlayGlass } from "@/lib/glass";
import { cn } from "@/lib/utils";
import { statusLabels } from "../../../shared/event-status";
import { formatCount } from "./format";
import type { Comparison, EventStatus, SocietyLabel } from "./platform-api";
import { changeText, changeTone, societyLabelHelp, societyLabelText } from "./platform-helpers";

/* ---------------------------------------------------------------------------------------------------------- */
/* Figures                                                                                                      */
/* ---------------------------------------------------------------------------------------------------------- */

/** A number over its label, with what it is compared with. A link when there is a list behind it. */
export function Figure({ label, value, detail, to, title }: { label: string; value: string; detail?: ReactNode; to?: To; title?: string }) {
  const body = (
    <>
      <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <span className="mt-2 block text-3xl font-semibold leading-none tabular-nums sm:text-4xl" title={title}>
        {value}
      </span>
      {detail ? <span className="mt-2 block text-sm text-muted-foreground">{detail}</span> : null}
    </>
  );
  const frame = "block border-border/80 py-5 pr-4 lg:border-l lg:px-6 lg:first:border-l-0 lg:first:pl-0";
  if (!to) return <div className={frame}>{body}</div>;
  return (
    <Link to={to} className={cn(frame, "group rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-80 group-hover:opacity-100">
        Open the list <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

/** A row of figures divided by hairlines; one column on a phone. */
export function FigureRow({ children, columns = 4 }: { children: ReactNode; columns?: 3 | 4 }) {
  return <div className={cn("grid border-b border-border/80", columns === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 lg:grid-cols-3")}>{children}</div>;
}

export function Change({ value, days }: { value: Comparison; days: number }) {
  const tone = changeTone(value);
  return <span className={cn(tone === "up" && "text-primary", tone === "down" && "text-destructive")}>{changeText(value, days)}</span>;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Labels                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------- */

const statusDot: Record<EventStatus, string> = {
  live: "bg-primary",
  upcoming: "bg-chart-budget",
  draft: "border border-dashed border-muted-foreground",
  completed: "bg-muted-foreground/60",
  cancelled: "bg-destructive",
};

/** An event's status with a dot and its word - the same words residents see (shared/event-status.ts). */
export function EventStatusLabel({ status }: { status: EventStatus | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", statusDot[status])} />
      <span className={cn(status === "cancelled" && "text-destructive")}>{statusLabels[status]}</span>
    </span>
  );
}

/** Solid fills for the proportion bar, where an outline would be invisible. */
const labelFill: Record<SocietyLabel, string> = {
  new: "bg-chart-budget",
  active: "bg-primary",
  quiet: "bg-primary/35",
  dormant: "bg-muted-foreground/45",
  empty: "bg-muted-foreground/15",
};

const labelDot: Record<SocietyLabel, string> = {
  new: "bg-chart-budget",
  active: "bg-primary",
  quiet: "bg-primary/35",
  dormant: "border border-muted-foreground",
  empty: "border border-dashed border-muted-foreground",
};

export function SocietyLabelTag({ label }: { label: SocietyLabel }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={societyLabelHelp[label]}>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", labelDot[label])} />
      {societyLabelText[label]}
    </span>
  );
}

/** How many societies carry each label, as one bar divided in proportion, with a legend that says the rule. */
export function LabelMeter({ labels, total }: { labels: Record<SocietyLabel, number>; total: number }) {
  const order: SocietyLabel[] = ["new", "active", "quiet", "dormant", "empty"];
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={order.map((key) => `${societyLabelText[key]} ${labels[key]}`).join(", ")}>
        {order
          .filter((key) => labels[key] > 0)
          .map((key) => (
            <span key={key} className={cn("h-full", labelFill[key])} style={{ width: `${(labels[key] / Math.max(total, 1)) * 100}%` }} />
          ))}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        {order.map((key) => (
          <li key={key} className="flex items-start gap-2.5">
            <span aria-hidden="true" className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", labelFill[key])} />
            <span className="min-w-0">
              <span className="font-medium tabular-nums">{formatCount(labels[key])}</span> {societyLabelText[key]}
              <span className="block text-xs text-muted-foreground">{societyLabelHelp[key]}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Avatar({ name, photoUrl, size = "md" }: { name: string | null; photoUrl?: string | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 text-base" : "h-8 w-8 text-xs";
  if (photoUrl) return <img src={photoUrl} alt="" referrerPolicy="no-referrer" className={cn("shrink-0 rounded-full border object-cover", box)} />;
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground", box)}>
      {initials || "?"}
    </span>
  );
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Lists                                                                                                        */
/* ---------------------------------------------------------------------------------------------------------- */

export function Pager({ page, pageSize, total, onPage, busy }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; busy?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  const button =
    "inline-flex min-h-10 items-center gap-1 rounded-lg border bg-card px-3 text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-muted-foreground">
      <span className="tabular-nums" aria-live="polite">
        {total ? `${formatCount(first)}–${formatCount(last)} of ${formatCount(total)}` : "No matches"}
        {busy ? " · updating" : ""}
      </span>
      <span className="flex gap-2">
        <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
        </button>
        <button type="button" className={button} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

/** A search box that waits until typing pauses before it changes the address (and so the request). */
export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => latest.current(draft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [draft, value]);

  return (
    <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card px-3 focus-within:ring-2 focus-within:ring-ring sm:max-w-sm">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        maxLength={60}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

/** Text choices in a row, the chosen one underlined in teal - the same treatment as Society Management's tabs. */
export function Choices<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  // A radio group is one tab stop, moved with the arrow keys; Home and End jump to the ends.
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  function move(to: number) {
    const next = (to + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: options.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    move(target);
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-x-1 gap-y-1">
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={index === selected ? 0 : -1}
          onKeyDown={(event) => onKeyDown(event, index)}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-10 rounded-lg px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option.value ? "bg-primary/[0.08] font-medium text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------- */
/* The read-only record                                                                                         */
/* ---------------------------------------------------------------------------------------------------------- */

/**
 * A person, society or event, opened over the list it came from. Its id is in the address (`?user=<id>`), so it
 * survives a refresh and the back button closes it. Nothing in it edits anything.
 */
export function DetailDrawer({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={`fixed inset-0 z-50 ${overlayGlass}`} />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-background shadow-[-12px_0_32px_-16px_hsl(var(--foreground)/0.35)] outline-none duration-300 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/80 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-2xl leading-tight">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{subtitle ?? "Read-only record"}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5">
            <p className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Read-only. Nothing here changes anything in Sympal Events.
            </p>
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A labelled value in a drawer. */
export function Fact({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="border-b border-border/80 pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Breakdowns                                                                                                   */
/* ---------------------------------------------------------------------------------------------------------- */

/**
 * A short list of labelled counts, each with a bar in proportion to the largest. For breakdowns of one thing
 * (devices, browsers, kinds of action). The number is always printed; the bar only helps the eye compare.
 */
export function BarList({ rows, format = formatCount, empty = "Nothing recorded in this period." }: { rows: { label: string; count: number }[]; format?: (value: number) => string; empty?: string }) {
  if (!rows.length) return <p className="py-3 text-sm text-muted-foreground">{empty}</p>;
  const most = Math.max(...rows.map((row) => row.count), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{format(row.count)}</span>
          </div>
          <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(row.count / most) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
