import { AlertTriangle, Clock, HandHeart, Pencil, Plus, Soup, Trash2, UserX, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { prasadItemRows } from "@/data/demo";
import { formatEventWeekday, getDateInEventZone } from "@/features/dashboard/dashboard-utils";
import { PrasadItemDialog, type EventDay } from "@/features/prasad/prasad-item-dialog";
import { PageTools } from "@/features/shared/page-tools";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import {
  byDayThenSlot,
  groupBySlot,
  isUnfilled,
  personKey,
  usePrasadItems,
  type PrasadItem,
  type PrasadItemInput,
  type PrasadPerson,
} from "@/lib/prasad";
import { cn } from "@/lib/utils";

/**
 * Prasad, slot by slot. Three "manys" drive the whole screen:
 *
 *   a slot   holds several prasad items - modak from one family and pedha from
 *            another, both in the Morning slot;
 *   an item  has several sponsors arranging it;
 *   an item  has several people distributing it.
 *
 * So the page nests: day -> slot -> the prasad items in it, each with its own
 * two lists of people. Every slot carries its own "Add prasad" button, which
 * is how a second prasad joins a slot that already has one.
 *
 * Cards at every width, like Tasks: a prasad is a handful of names, not a row
 * of columns, and it has to read on a phone at the counter.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The event's days as "Day 1" + "Mon, 14 Sept" - none for a long or undated event. */
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

function matchesSearch(item: PrasadItem, term: string) {
  if (!term) return true;
  return [item.slot, item.item, item.notes, ...item.arrangers.flatMap((p) => [p.name, p.flat]), ...item.distributors.flatMap((p) => [p.name, p.flat])]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

function uniquePeople(items: PrasadItem[], pick: (item: PrasadItem) => PrasadPerson[]) {
  return new Set(items.flatMap(pick).map(personKey)).size;
}

export function PrasadPage() {
  const { data } = useEventData();
  const { selectedEventId } = useEventContext();
  const { query, create, update, remove } = usePrasadItems(selectedEventId);
  const [dayFilter, setDayFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState<PrasadItem | undefined>();
  const [dialogSlot, setDialogSlot] = useState<{ date: string; slot: string } | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);

  const fromApi = Boolean(selectedEventId);
  const isLoading = fromApi && query.isLoading;
  const canEdit = query.data?.access.canEdit ?? false;
  const ready = query.data?.ready ?? true;
  const { startDate, endDate } = data.event;

  const items = useMemo(
    () => [...(fromApi ? query.data?.slots ?? [] : prasadItemRows)].sort(byDayThenSlot),
    [fromApi, query.data],
  );
  const eventDays = useMemo(() => eventDaysBetween(startDate, endDate), [startDate, endDate]);

  // Tabs: every event day, plus any day something sits on outside the event's
  // dates (a pre-event puja, say), so nothing is unreachable.
  const dayTabs = useMemo(() => {
    const dates = new Set([...eventDays.map((day) => day.date), ...items.map((item) => item.date)]);
    return [...dates].sort().map((date) => ({ date, ...dayHeading(date, eventDays) }));
  }, [eventDays, items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => (dayFilter === "all" || item.date === dayFilter) && matchesSearch(item, term));
  }, [items, dayFilter, search]);

  const days = useMemo(() => {
    const byDate = new Map<string, PrasadItem[]>();
    for (const item of visible) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
    return [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, list]) => ({ date, ...dayHeading(date, eventDays), slots: groupBySlot(list), count: list.length }));
  }, [visible, eventDays]);

  const counts = useMemo(
    () => ({
      items: items.length,
      slots: new Set(items.map((item) => `${item.date}|${item.slot.trim().toLowerCase()}`)).size,
      sponsors: uniquePeople(items, (item) => item.arrangers),
      distributors: uniquePeople(items, (item) => item.distributors),
      unfilled: items.filter(isUnfilled).length,
    }),
    [items],
  );

  const knownPeople = useMemo(() => items.flatMap((item) => [...item.arrangers, ...item.distributors]), [items]);

  const today = getDateInEventZone();
  const defaultDate =
    dayFilter !== "all"
      ? dayFilter
      : eventDays.some((day) => day.date === today)
        ? today
        : eventDays[0]?.date ?? today;

  /** Edit one, add a fresh one, or add another into a slot that exists. */
  function openDialog(item?: PrasadItem, intoSlot?: { date: string; slot: string }) {
    setDialogItem(item);
    setDialogSlot(intoSlot);
    setDialogOpen(true);
  }

  function handleSubmit(input: PrasadItemInput) {
    return dialogItem
      ? update.mutateAsync({ id: dialogItem.id, updatedAt: dialogItem.updatedAt, ...input })
      : create.mutateAsync(input);
  }

  async function handleDelete(item: PrasadItem) {
    if (!window.confirm(`Delete "${item.item}" from the ${item.slot} slot? Its sponsors and distributors go with it.`)) return;
    setActionError(null);
    try {
      await remove.mutateAsync(item.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete this prasad");
    }
  }

  const emptyMessage = items.length
    ? "Nothing matches this view."
    : canEdit
      ? "No prasad planned yet. Add the first one - a day, a slot, and who is sponsoring it. A slot can hold as many prasad items as you need."
      : "No prasad has been planned yet.";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Prasad</h2>
          <p className="text-sm text-muted-foreground">
            Every slot can hold several prasad items, each with its own sponsors and the people handing it out.
          </p>
        </div>
        <DataSourceBadge source={fromApi ? "supabase" : data.source} reason={data.fallbackReason} />
      </div>

      {query.isError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Unable to load prasad"}
        </p>
      ) : null}

      {query.data && !ready ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Adding and editing prasad is switched off until{" "}
            <code className="font-mono text-xs">019_prasad_slots.sql</code> has been run in Supabase.
          </span>
        </p>
      ) : null}

      <StatGrid>
        <StatCard
          title="Prasad"
          value={String(counts.items)}
          icon={Soup}
          isLoading={isLoading}
          note={counts.slots ? `Across ${counts.slots} ${counts.slots === 1 ? "slot" : "slots"}` : undefined}
        />
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
          note={counts.unfilled ? "Missing a sponsor or helper" : "All covered"}
        />
      </StatGrid>

      <PageTools
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search prasad, names, flats"
        searchLabel="Search prasad"
        action={
          canEdit ? (
            <Button type="button" onClick={() => openDialog()} disabled={!ready} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Prasad
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
                aria-controls="prasad-days"
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

      <div id="prasad-days" role={dayTabs.length > 1 ? "tabpanel" : undefined} className="space-y-6">
        {isLoading ? (
          <div className="space-y-2.5" aria-busy="true">
            {[0, 1].map((key) => (
              <div key={key} className="h-40 animate-pulse rounded-lg border bg-muted/50" />
            ))}
          </div>
        ) : days.length ? (
          days.map((day) => (
            <section key={day.date} className="space-y-2.5" aria-label={`${day.label} ${day.sub}`.trim()}>
              <h3 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
                {day.label}
                {day.sub ? <span className="text-sm font-normal text-muted-foreground">{day.sub}</span> : null}
                <span className="text-sm font-normal tabular-nums text-muted-foreground">
                  · {day.count} {day.count === 1 ? "prasad" : "prasad items"}
                </span>
              </h3>

              {day.slots.map((group) => (
                <SlotGroup
                  key={`${day.date}-${group.slot.toLowerCase()}`}
                  date={day.date}
                  slot={group.slot}
                  items={group.items}
                  canEdit={canEdit && ready}
                  onAdd={() => openDialog(undefined, { date: day.date, slot: group.slot })}
                  onEdit={openDialog}
                  onDelete={handleDelete}
                />
              ))}
            </section>
          ))
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>

      {canEdit ? (
        <PrasadItemDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          item={dialogItem}
          defaultDate={dialogSlot?.date ?? defaultDate}
          defaultSlot={dialogSlot?.slot}
          eventDays={eventDays.map((day) => ({ ...day, sub: formatEventWeekday(day.date) }))}
          knownPeople={knownPeople}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}

/** One slot, with every prasad in it - and its own "Add prasad". */
function SlotGroup({
  date,
  slot,
  items,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  date: string;
  slot: string;
  items: PrasadItem[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (item: PrasadItem) => void;
  onDelete: (item: PrasadItem) => void;
}) {
  const sponsors = uniquePeople(items, (item) => item.arrangers);

  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-muted/40 px-3 py-2">
        <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          {slot}
        </h4>
        <p className="text-xs tabular-nums text-muted-foreground">
          {items.length} {items.length === 1 ? "prasad" : "prasad items"}
          {sponsors ? ` · ${sponsors} ${sponsors === 1 ? "sponsor" : "sponsors"}` : ""}
        </p>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-label={`Add another prasad to the ${slot} slot on ${formatEventWeekday(date)}`}
            onClick={onAdd}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add prasad
          </Button>
        ) : null}
      </header>

      <ul className="divide-y">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn("px-3 py-2.5", isUnfilled(item) && "border-l-2 border-l-amber-300")}
          >
            <div className="flex items-start justify-between gap-2">
              <h5 className="min-w-0 pt-1.5 text-sm font-medium">{item.item}</h5>
              {canEdit ? (
                <span className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-9"
                    aria-label={`Edit ${item.item} in the ${item.slot} slot`}
                    onClick={() => onEdit(item)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-9"
                    aria-label={`Delete ${item.item} from the ${item.slot} slot`}
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
              ) : null}
            </div>

            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <PeopleList icon={HandHeart} label="Sponsored by" people={item.arrangers} emptyText="No sponsor yet" />
              <PeopleList icon={Users} label="Distributed by" people={item.distributors} emptyText="Nobody distributing yet" />
            </div>

            {item.notes ? <p className="mt-2 text-xs text-muted-foreground">{item.notes}</p> : null}
          </li>
        ))}
      </ul>
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
    <div className="mt-1.5">
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
