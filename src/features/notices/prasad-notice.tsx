import { useMemo, useState } from "react";
import { formatEventWeekday } from "@/features/dashboard/dashboard-utils";
import {
  NoticeBlock,
  NoticeDialog,
  NoticeEmpty,
  NoticeSheet,
  type NoticeAudience,
} from "@/features/notices/notice-sheet";
import type { AppEvent } from "@/lib/event-data";
import { noticeDayLabel } from "@/lib/notices";
import { groupBySlot, type PrasadItem, type PrasadPerson } from "@/lib/prasad";

/**
 * The prasad notice - which prasad is served in which slot, and who is
 * sponsoring it. This is the one residents actually read, so the external
 * copy thanks the sponsors by name but carries **no flat numbers**, and
 * leaves the distribution duty (who is on the counter) to the committee copy.
 */
function names(people: PrasadPerson[], audience: NoticeAudience) {
  return people
    .map((person) => (audience === "internal" && person.flat ? `${person.name} (${person.flat})` : person.name))
    .join(", ");
}

function dayLabel(date: string, event: AppEvent) {
  return noticeDayLabel(date, event.startDate, formatEventWeekday);
}

export function PrasadNoticeDialog({
  open,
  onOpenChange,
  event,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AppEvent;
  items: PrasadItem[];
}) {
  const [audience, setAudience] = useState<NoticeAudience>("external");

  const days = useMemo(() => {
    const byDate = new Map<string, PrasadItem[]>();
    for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
    return [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, list]) => ({ date, slots: groupBySlot(list) }));
  }, [items]);

  return (
    <NoticeDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Prasad notice"
      documentTitle={`${event.name} - Prasad`}
      audience={audience}
      onAudienceChange={setAudience}
    >
      <NoticeSheet
        eventName={event.name}
        eventDates={event.dates}
        location={event.location}
        title="Prasad"
        intro={
          audience === "external"
            ? "Prasad for each day, and the families arranging it. Our thanks to everyone on this list."
            : undefined
        }
        audience={audience}
      >
        {days.length ? (
          days.map((day) => (
            <NoticeBlock key={day.date} heading={dayLabel(day.date, event)} meta={formatEventWeekday(day.date)}>
              {day.slots.map((group) => (
                <div key={group.slot} className="notice-block">
                  <p className="text-sm font-semibold">{group.slot}</p>
                  <ul className="mt-0.5 space-y-1.5">
                    {group.items.map((item) => (
                      <li key={item.id} className="text-sm">
                        <span className="font-medium">{item.item}</span>
                        {item.arrangers.length ? (
                          <span> - {names(item.arrangers, audience)}</span>
                        ) : (
                          <span className="italic text-muted-foreground"> - sponsor still needed</span>
                        )}
                        {audience === "internal" ? (
                          <span className="block text-xs text-muted-foreground">
                            {item.distributors.length
                              ? `Distributing: ${names(item.distributors, audience)}`
                              : "Nobody distributing yet"}
                            {item.notes ? ` · ${item.notes}` : ""}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </NoticeBlock>
          ))
        ) : (
          <NoticeEmpty>No prasad has been planned yet.</NoticeEmpty>
        )}
      </NoticeSheet>
    </NoticeDialog>
  );
}
