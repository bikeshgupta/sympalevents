import { AlertTriangle, Clock, HandHeart, Pencil, Plus, Soup, Trash2, UserX, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { prasadSlotRows } from "@/data/demo";
import { formatEventWeekday, getDateInEventZone } from "@/features/dashboard/dashboard-utils";
import { PrasadSlotDialog, type EventDay } from "@/features/prasad/prasad-slot-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import {
  byDayThenSlot,
  isUnfilled,
  personKey,
  usePrasadSlots,
  type PrasadPerson,
  type PrasadSlot,
  type PrasadSlotInput,
} from "@/lib/prasad";
import { cn } from "@/lib/utils";

/**
 * Prasad, slot by slot: for each day, each slot (morning, noon, evening, or
 * whatever the committee names it), what is served, who arranges it - the
 * prasad sponsors - and who hands it out. Several people on either list is
 * the normal case, so both are lists, never a single name.
 *
 * Cards at every width, grouped by day, like Tasks: a slot is a handful of
 * names, not a row of columns, and it has to read on a phone at the counter.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The event's days as "Day 1 · Mon, 14 Sept" - none for a long or undated event. */
function eventDaysBetween(startDate: string, endDate: string): EventDay[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return [];
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const count = Math.round((Date.parse(`${endDate}T00:00:00Z`) - start) / MS_PER_DAY) + 1;
  if (count < 1 || count > 10) return [];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start + index * MS_PER_DAY).toISOString().slice(0, 10);
    return { date, label: `Day ${index + 1}` };
  });
}

function dayHeading(date: string, eventDays: EventDay[]) {
  const day = eventDays.find((entry) => entry.date === date);
  return { label: day?.label ?? formatEventWeekday(date), sub: day ? formatEventWeekday(date) : "" };
}

function matchesSearch(slot: PrasadSlot, term: string) {
  if (!term) return true;
  return [slot.slot, slot.item, slot.notes, ...slot.arrangers.flatMap((p) => [p.name, p.flat]), ...slot.distributors.flatMap((p) => [p.name, p.flat])]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

function uniquePeople(slots: PrasadSlot[], pick: (slot: PrasadSlot) => PrasadPerson[]) {
  return new Set(slots.flatMap(pick).map(personKey)).size;
}

export function PrasadPage() {
  const { data } = useEventData();
  const { selectedEventId } = useEventContext();
  const { query, create, update, remove } = usePrasadSlots(selectedEventId);
  const [dayFilter, setDayFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSlot, setDialogSlot] = useState<PrasadSlot | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);

  const fromApi = Boolean(selectedEventId);
  const isLoading = fromApi && query.isLoading;
  const canEdit = query.data?.access.canEdit ?? false;
  const ready = query.data?.ready ?? true;
  const { startDate, endDate } = data.event;

  const slots = useMemo(
    () => [...(fromApi ? query.data?.slots ?? [] : prasadSlotRows)].sort(byDayThenSlot),
    [fromApi, query.data],
  );
  const eventDays = useMemo(() => eventDaysBetween(startDate, endDate), [startDate, endDate]);

  // Tabs: every event day, plus any day a slot sits on outside the event's
  // dates (a pre-event puja, say), so nothing is unreachable.
  const dayTabs = useMemo(() => {
    const dates = new Set([...eventDays.map((day) => day.date), ...slots.map((slot) => slot.date)]);
    return [...dates].sort().map((date) => ({ date, ...dayHeading(date, eventDays) }));
  }, [eventDays, slots]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return slots.filter((slot) => (dayFilter === "all" || slot.date === dayFilter) && matchesSearch(slot, term));
  }, [slots, dayFilter, search]);

  const groups = useMemo(() => {
    const byDate = new Map<string, PrasadSlot[]>();
    for (const slot of visible) byDate.set(slot.date, [...(byDate.get(slot.date) ?? []), slot]);
    return [...byDate.entries()].map(([date, list]) => ({ date, ...dayHeading(date, eventDays), slots: list }));
  }, [visible, eventDays]);

  const counts = useMemo(
    () => ({
      slots: slots.length,
      sponsors: uniquePeople(slots, (slot) => slot.arrangers),
      distributors: uniquePeople(slots, (slot) => slot.distributors),
      unfilled: slots.filter(isUnfilled).length,
    }),
    [slots],
  );

  const knownPeople = useMemo(() => slots.flatMap((slot) => [...slot.arrangers, ...slot.distributors]), [slots]);

  const today = getDateInEventZone();
  const defaultDate =
    dayFilter !== "all"
      ? dayFilter
      : eventDays.some((day) => day.date === today)
        ? today
        : eventDays[0]?.date ?? today;

  function openDialog(slot?: PrasadSlot) {
    setDialogSlot(slot);
    setDialogOpen(true);
  }

  function handleSubmit(input: PrasadSlotInput) {
    return dialogSlot
      ? update.mutateAsync({ id: dialogSlot.id, updatedAt: dialogSlot.updatedAt, ...input })
      : create.mutateAsync(input);
  }

  async function handleDelete(slot: PrasadSlot) {
    const when = `${slot.slot} slot on ${formatEventWeekday(slot.date)}`;
    if (!window.confirm(`Delete the ${when}? Its lists of who arranges and who distributes go with it.`)) return;
    setActionError(null);
    try {
      await remove.mutateAsync(slot.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete the slot");
    }
  }

  const emptyMessage = slots.length
    ? "No slots match this view."
    : canEdit
      ? "No prasad slots yet. Add the first one - pick a day and a slot, then who arranges and who distributes."
      : "No prasad slots have been planned yet.";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Prasad</h2>
          <p className="text-sm text-muted-foreground">
            Each slot, what is served, who arranges it and who hands it out.
          </p>
        </div>
        <DataSourceBadge source={fromApi ? "supabase" : data.source} reason={data.fallbackReason} />
      </div>

      {query.isError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Unable to load prasad slots"}
        </p>
      ) : null}

      {query.data && !ready ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Adding and editing prasad slots is switched off until{" "}
            <code className="font-mono text-xs">019_prasad_slots.sql</code> has been run in Supabase.
          </span>
        </p>
      ) : null}

      <StatGrid>
        <StatCard title="Slots" value={String(counts.slots)} icon={Soup} isLoading={isLoading} />
        <StatCard title="Sponsors" value={String(counts.sponsors)} icon={HandHeart} isLoading={isLoading} note="Arranging prasad" />
        <StatCard
          title="Distributors"
          shortTitle="Helpers"
          value={String(counts.distributors)}
          icon={Users}
          isLoading={isLoading}
          note="Handing it out"
        />
        <StatCard
          title="Unfilled"
          value={String(counts.unfilled)}
          icon={UserX}
          isLoading={isLoading}
          note={counts.unfilled ? "Missing a sponsor or helper" : "Every slot is covered"}
        />
      </StatGrid>

      <PageTools
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search names, flats, prasad"
        searchLabel="Search prasad slots"
        action={
          canEdit ? (
            <Button type="button" onClick={() => openDialog()} disabled={!ready} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Slot
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">View-only access</span>
          )
        }
      />

      {dayTabs.length > 1 ? (
        <div className="overflow-x-auto">
          <div role="tablist" aria-label="Filter by day" className="inline-flex min-w-full rounded-md border p-0.5 sm:min-w-0">
            {[{ date: "all", label: "All days", sub: "" }, ...dayTabs].map((tab) => (
              <button
                key={tab.date}
                role="tab"
                type="button"
                aria-selected={dayFilter === tab.date}
                aria-controls="prasad-slots"
                onClick={() => setDayFilter(tab.date)}
                className={cn(
                  "min-h-10 flex-1 whitespace-nowrap rounded px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
                  dayFilter === tab.date ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {actionError ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p> : null}

      <div id="prasad-slots" role={dayTabs.length > 1 ? "tabpanel" : undefined} className="space-y-6">
        {isLoading ? (
          <div className="grid gap-2.5 md:grid-cols-2" aria-busy="true">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="h-32 animate-pulse rounded-lg border bg-muted/50" />
            ))}
          </div>
        ) : groups.length ? (
          groups.map((group) => (
            <section key={group.date} className="space-y-2.5" aria-label={`${group.label} ${group.sub}`.trim()}>
              <h3 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
                {group.label}
                {group.sub ? <span className="text-sm font-normal text-muted-foreground">{group.sub}</span> : null}
                <span className="text-sm font-normal tabular-nums text-muted-foreground">
                  · {group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}
                </span>
              </h3>
              <div className="grid gap-2.5 md:grid-cols-2">
                {group.slots.map((slot) => (
                  <SlotCard key={slot.id} slot={slot} canEdit={canEdit && ready} onEdit={openDialog} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>

      {canEdit ? (
        <PrasadSlotDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          slot={dialogSlot}
          defaultDate={defaultDate}
          eventDays={eventDays.map((day) => ({ ...day, sub: formatEventWeekday(day.date) }))}
          knownPeople={knownPeople}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}

function SlotCard({
  slot,
  canEdit,
  onEdit,
  onDelete,
}: {
  slot: PrasadSlot;
  canEdit: boolean;
  onEdit: (slot: PrasadSlot) => void;
  onDelete: (slot: PrasadSlot) => void;
}) {
  const name = `${slot.slot} slot${slot.item ? ` (${slot.item})` : ""}`;

  return (
    <article className={cn("rounded-lg border bg-card px-3 py-2.5", isUnfilled(slot) && "border-amber-300")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {slot.slot}
          </span>
          {slot.item ? <h4 className="text-sm font-medium">{slot.item}</h4> : null}
        </div>
        {canEdit ? (
          <span className="flex shrink-0 items-center">
            <Button type="button" variant="ghost" size="icon" className="h-10 w-9" aria-label={`Edit ${name}`} onClick={() => onEdit(slot)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-10 w-9" aria-label={`Delete ${name}`} onClick={() => onDelete(slot)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </span>
        ) : null}
      </div>

      <PeopleList icon={HandHeart} label="Arranged by" people={slot.arrangers} emptyText="Nobody arranging yet" />
      <PeopleList icon={Users} label="Distributed by" people={slot.distributors} emptyText="Nobody distributing yet" />

      {slot.notes ? <p className="mt-2 text-xs text-muted-foreground">{slot.notes}</p> : null}
    </article>
  );
}

function PeopleList({
  icon: Icon,
  label,
  people,
  emptyText,
}: {
  icon: typeof Users;
  label: string;
  people: PrasadPerson[];
  emptyText: string;
}) {
  return (
    <div className="mt-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
        {people.length > 1 ? <span className="tabular-nums">({people.length})</span> : null}
      </p>
      {people.length ? (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {people.map((person) => (
            <li key={personKey(person)} className="rounded-md bg-muted px-2 py-1 text-sm">
              {person.name}
              {person.flat ? <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{person.flat}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-sm text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          {emptyText}
        </p>
      )}
    </div>
  );
}
