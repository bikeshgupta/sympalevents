import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Camera, PenLine, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HeroEmbers, RisingWords } from "@/components/shared/dashboard-fx";
import { useSession } from "@/lib/auth";
import { useEventClosing } from "@/lib/closing";
import { finishedLabel, readLastShown, reminderMayShow, writeLastShown } from "@/lib/closing-reminder";
import { useDashboardMotion } from "@/lib/dashboard-motion";
import { useEventAccess } from "@/lib/event-access";
import { useEventData } from "@/lib/event-data";
import { useEventPath } from "@/lib/event-path";
import { getDateInEventZone, getEventStatus } from "@/lib/event-status";
import { overlayGlass } from "@/lib/glass";
import { pageKeyFromPath } from "@/lib/page-access";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/view-mode";

/**
 * "Diwali Mela 2026 is over. Let's make it a memory." - the once-a-day nudge an
 * event's own admin gets until the celebration is closed. The rules are pure and
 * tested in src/lib/closing-reminder.ts; this only draws them.
 *
 * It never closes anything. Its one action lands the admin on the closing page
 * in draft, where they review the note, add anyone the records missed, add
 * photographs, and press Mark as closed when it feels right. Nothing on it claims
 * to be finished: the note and the credits are drafts to review, because the
 * records may not hold everybody who helped, and there are no reviews yet -
 * residents leave those once the event is a memory.
 *
 * Mounted once in AppLayout, so it meets the admin on whichever event page they
 * open first that day. The closing row (is_closed) is read only when every other
 * rule already says yes, so nobody else pays a request for it.
 */
export function ClosingReminder() {
  const { data } = useEventData();
  const { data: access } = useEventAccess();
  const { data: session } = useSession();
  const view = useViewMode();
  const location = useLocation();
  const navigate = useNavigate();
  const eventPath = useEventPath();
  const motion = useDashboardMotion();
  const now = useMemo(() => new Date(), []);
  const today = getDateInEventZone(now);

  const event = data.event;
  const userId = session?.user.appUserId ?? null;
  const [showing, setShowing] = useState(false);

  const mayShow =
    data.source === "supabase" &&
    Boolean(event.id && userId) &&
    !view.isLoading &&
    reminderMayShow({
      eventRole: access?.eventRole,
      isResidentView: view.mode === "resident",
      onClosingPage: pageKeyFromPath(location.pathname) === "closing",
      status: getEventStatus(
        {
          startDate: event.startDate,
          endDate: event.endDate,
          startTime: event.startTime,
          endTime: event.endTime,
          statusOverride: event.statusOverride,
          isClosed: false,
        },
        now,
      ),
      lastShownDay: event.id && userId ? readLastShown(event.id, userId) : null,
      today,
    });

  const closing = useEventClosing(mayShow ? event.id : undefined);
  const waitingToClose = Boolean(closing.data && !closing.data.closing.is_closed);

  // Latched: once it has opened, writing "shown today" must not snap it shut.
  useEffect(() => {
    if (showing || !mayShow || !waitingToClose || !event.id || !userId) return;
    writeLastShown(event.id, userId, today);
    setShowing(true);
  }, [showing, mayShow, waitingToClose, event.id, userId, today]);

  if (!showing) return null;

  return (
    <ClosingReminderSheet
      eventName={event.name}
      dates={event.dates}
      location={event.location}
      finished={finishedLabel(event.endDate, today)}
      motion={motion}
      onOpenClosingPage={() => {
        setShowing(false);
        navigate(eventPath("/closing"));
      }}
      onDismiss={() => setShowing(false)}
    />
  );
}

/** What the reminder looks like, apart from when it shows. */
export function ClosingReminderSheet({
  eventName,
  dates,
  location,
  finished,
  motion,
  onOpenClosingPage,
  onDismiss,
}: {
  eventName: string;
  dates: string;
  location: string | null | undefined;
  finished: string;
  motion: boolean;
  onOpenClosingPage: () => void;
  onDismiss: () => void;
}) {
  const title = `${eventName} is over. Let's make it a memory.`;
  // Focus lands on the one action, not on the close button in the corner.
  const primaryRef = useRef<HTMLButtonElement>(null);
  const prepared = [
    { icon: PenLine, title: "Thank-you note", note: "Drafted - make it yours" },
    { icon: Users, title: "Credits", note: "From records - add anyone missing" },
    { icon: Camera, title: "Photographs", note: "Add the moments you want to keep", wide: true },
  ];

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onDismiss()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 print:hidden", overlayGlass)} />
        <DialogPrimitive.Content
          // The content box fills the screen so the sheet can sit at the foot on a
          // phone and in the middle from `sm`; a tap on the empty part is "not today".
          className="fixed inset-0 z-50 flex items-end justify-center p-3 focus:outline-none sm:items-center"
          onOpenAutoFocus={(focusEvent) => {
            focusEvent.preventDefault();
            primaryRef.current?.focus();
          }}
          onClick={(clickEvent) => {
            if (clickEvent.target === clickEvent.currentTarget) onDismiss();
          }}
        >
          <div className="dfx-sheet relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-card shadow-2xl">
            <div className="relative overflow-hidden bg-gradient-to-br from-primary via-[hsl(var(--primary)/0.85)] to-rose-900 px-5 pb-5 pt-6 text-white">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-amber-300/40 blur-3xl"
              />
              {motion ? <HeroEmbers /> : null}
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Remind me tomorrow"
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                {finished}
              </p>
              <DialogPrimitive.Title
                className="font-display relative mt-1.5 pr-10 text-2xl font-semibold leading-tight"
                aria-label={title}
              >
                {motion ? <RisingWords text={title} /> : title}
              </DialogPrimitive.Title>
              <div className="relative mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                <span className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1">{dates}</span>
                {location ? (
                  <span className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1">{location}</span>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 p-5">
              <DialogPrimitive.Description className="text-sm text-muted-foreground">
                We have prepared the closing page for you. Please review it, add anyone or anything we missed, and close
                it when it feels right.
              </DialogPrimitive.Description>

              <ul className="grid grid-cols-2 gap-2">
                {prepared.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <li
                      key={item.title}
                      className={cn(
                        "flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5",
                        item.wide && "col-span-2",
                        motion && "dfx-pop",
                      )}
                      style={motion ? { animationDelay: `${650 + index * 90}ms` } : undefined}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-tight">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">{item.note}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div
                className={cn("rounded-xl bg-primary/10 px-3 py-2.5 text-sm", motion && "dfx-pop")}
                style={motion ? { animationDelay: "950ms" } : undefined}
              >
                <p className="font-display text-base font-semibold">Once you close it</p>
                <p className="text-muted-foreground">
                  the event becomes a memory: your thank-you, the credits and the photos lead the page, residents can
                  share their feedback, and everyone can relive it any time.
                </p>
              </div>

              <div className="grid gap-2 pt-1">
                <button
                  ref={primaryRef}
                  type="button"
                  onClick={onOpenClosingPage}
                  className="relative min-h-[52px] overflow-hidden rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 px-4 text-base font-bold text-amber-950 shadow-lg shadow-amber-500/30 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {motion ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 -left-1/3 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/50 to-transparent"
                    />
                  ) : null}
                  <span className="relative">Open the closing page</span>
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="min-h-11 rounded-xl border bg-card px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Remind me tomorrow
                </button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Nothing changes until you press Mark as closed there.
              </p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
