import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatEventDate, formatEventTime } from "@/features/dashboard/dashboard-utils";
import { activeAnnouncements, leadTimeLabel, resolveAnnouncements } from "@/lib/announcements";
import type { AppEvent } from "@/lib/event-data";

/**
 * The header bell. Counts notices that have not finished yet and lists them.
 * Opening it re-reads the clock so lead times ("in 2 days") stay honest.
 */
export function AnnouncementsBell({ event }: { event?: AppEvent }) {
  const [now, setNow] = useState(() => new Date());
  const items = useMemo(() => resolveAnnouncements(event), [event]);
  const active = activeAnnouncements(items, now);

  return (
    <DropdownMenu.Root onOpenChange={(open) => open && setNow(new Date())}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={active.length ? `Notifications, ${active.length} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {active.length ? (
            <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
            </span>
          ) : null}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <p className="px-2 py-2 text-sm font-semibold">News &amp; Announcements</p>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          {items.length ? (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {items.map((item) => {
                const lead = leadTimeLabel(item, now);
                const isDone = lead === "Completed";
                const isLive = lead === "Happening now";

                return (
                  <div key={item.id} className={`rounded-sm px-2 py-2 ${isDone ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-2">
                      <Sparkles
                        className={`h-3.5 w-3.5 shrink-0 ${isDone ? "text-muted-foreground" : "text-primary"}`}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-semibold uppercase tracking-wide text-primary">{item.tag}</span>
                      {isLive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Live
                        </span>
                      ) : lead ? (
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{lead}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-medium leading-snug">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        item.day,
                        item.resolvedDate ? formatEventDate(item.resolvedDate) : null,
                        item.time ? formatEventTime(item.time) : null,
                        item.location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-2 py-4 text-sm text-muted-foreground">No announcements right now.</p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
