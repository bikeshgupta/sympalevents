import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  LayoutGrid,
  MoreHorizontal,
  Palette,
  SlidersHorizontal,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DataSourceBadge } from "@/components/shared/data-source-badge";
import { Button } from "@/components/ui/button";
import { FlatCards } from "@/components/ui/card";
import { AddressCard } from "@/features/settings/address-card";
import { AppearanceCard } from "@/features/settings/appearance-card";
import { DuplicateEventCard } from "@/features/settings/duplicate-event-card";
import { EventDetailsCard } from "@/features/settings/event-details-card";
import { GoodToKnowCard } from "@/features/settings/good-to-know-card";
import { ModulesCard } from "@/features/settings/modules-card";
import { SettingsDirtyProvider } from "@/features/settings/settings-dirty";
import { useDirtyIds } from "@/features/settings/settings-dirty-state";
import {
  dateRangeLabel,
  defaultSection,
  dirtySectionKeys,
  isPanelKey,
  plural,
  readinessHeadline,
  readinessTarget,
  sectionDefs,
  type ReadinessTarget,
  type SectionDef,
  type SectionKey,
} from "@/features/settings/settings-sections";
import { ShareCard } from "@/features/settings/share-card";
import { SocietyCard } from "@/features/settings/society-card";
import { TeamPanel } from "@/features/settings/team-panel";
import { useAccessRequests, useRoster } from "@/features/settings/team-data";
import { eventTypeLabel } from "@/features/society/event-type-style";
import { EventArtwork } from "@/features/society/event-artwork";
import { formatEventDate } from "@/features/dashboard/dashboard-utils";
import { useSession } from "@/lib/auth";
import { useCommandCentre } from "@/lib/command-centre";
import { useEventAccess } from "@/lib/event-access";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { useEventPath } from "@/lib/event-path";
import { describeEventHours } from "@/lib/event-hours";
import { getEventStatus, statusLabels } from "@/lib/event-status";
import { usePageAccess, usePageVisibility, visibilityLabels } from "@/lib/page-access";
import { heroFocus } from "@/lib/hero";
import { themeByKey } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { menuGlass } from "@/lib/glass";

/**
 * Event Settings: one section at a time.
 *
 * It used to be every setting an event has, stacked in one long page of boxes. It is now an index of eight
 * sections - each with one line that is true of this event right now - and the section you open. Nothing about how
 * a control saves has changed: every card still keeps its own draft and its own Save button, calls the same
 * route, and says what happened in the same words. What is new is the frame around them:
 *
 *  - every section stays mounted and the ones you are not looking at are only hidden, so a half-typed change
 *    survives a trip to another section (and is flagged "Unsaved" on the index until it is saved);
 *  - leaving Settings with unsaved changes asks first (see settings-dirty.tsx);
 *  - the address says which section is open (`?section=team`), so one can be linked to or come back to;
 *  - the readiness line is the command centre's own checklist, not a second engine.
 *
 * The sections are only a grouping. Which pages an event has is still `event_page_visibility`, who may open or
 * edit what is still decided by the server, and nothing here widens either.
 */

const sectionIcons: Record<SectionKey, LucideIcon> = {
  basics: Info,
  schedule: CalendarDays,
  pages: LayoutGrid,
  team: Users,
  registration: Ticket,
  appearance: Palette,
  notifications: Bell,
  advanced: SlidersHorizontal,
};

export function SettingsPage() {
  return (
    <SettingsDirtyProvider>
      <SettingsShell />
    </SettingsDirtyProvider>
  );
}

function SettingsShell() {
  const { data } = useEventData();
  const { data: session } = useSession();
  const access = usePageAccess("settings");
  const { selectedEventId, selectedEvent, societies } = useEventContext();
  const path = useEventPath();
  const [params, setParams] = useSearchParams();
  const dirtyIds = useDirtyIds();

  const { data: eventAccess } = useEventAccess();
  const command = useCommandCentre(access.canEdit ? selectedEventId : undefined);
  const { query: visibilityQuery } = usePageVisibility();
  const { data: requests } = useAccessRequests();
  const { data: roster } = useRoster();

  const raw = params.get("section");
  const active: SectionKey | null = isPanelKey(raw) ? raw : null;
  // On a wide screen there is room for the index and a section side by side, so something is always open there.
  // The panel that slides back out keeps its content until it has gone, so it is the last one that was open.
  const lastActive = useRef<SectionKey | null>(null);
  if (active) lastActive.current = active;
  const shown: SectionKey = active ?? lastActive.current ?? defaultSection;
  const dirtySections = dirtySectionKeys(dirtyIds);

  const event = data.event;
  const status = getEventStatus(event);
  const isDraft = event.statusOverride === "draft";
  const isSocietyAdmin = societies.some((society) => society.id === selectedEvent?.societyId && society.role === "admin");
  const modules = visibilityQuery.data?.modules;
  const readiness = command.data?.readiness.items;
  const headline = readinessHeadline(readiness, isDraft);
  const gaps = (readiness ?? []).filter((item) => item.status === "missing");

  // Opening a section starts at its heading, and moves focus there so a keyboard or screen-reader user arrives
  // where the eye does. Not on first render: a plain visit to Settings has not asked for anything yet.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // On a phone the section is a sheet with its own scroll, and the index underneath keeps its place; from lg the
    // section is part of the page.
    if (active) {
      sheetRef.current?.scrollTo({ top: 0 });
      if (window.matchMedia("(min-width: 1024px)").matches) window.scrollTo({ top: 0 });
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [active]);

  function openSection(key: SectionKey) {
    setParams({ section: key });
  }
  function closeSection() {
    setParams({});
  }

  // ---- one line per section, from data this page already has --------------------------------------------------
  const enabledModules = modules?.filter((module) => module.isEnabled) ?? [];
  const publicModules = enabledModules.filter((module) => module.visibility === "public");
  const registrationItem = readiness?.find((item) => item.key === "registration");
  const summaries: Record<SectionKey, string> = {
    basics: [event.name, eventTypeLabel(event.eventType ?? "festival")].filter(Boolean).join(" · "),
    schedule: [
      dateRangeLabel(event.startDate, event.endDate, formatEventDate),
      event.location?.trim() || "No venue yet",
    ]
      .filter(Boolean)
      .join(" · "),
    pages: modules
      ? `${plural(enabledModules.length, "page")} on · ${publicModules.length} open to anyone with the link`
      : "Which pages this event has, and who can open them",
    team:
      roster || requests
        ? [
            roster ? plural(roster.length, "person", "people") : null,
            requests && requests.length > 0 ? `${plural(requests.length, "request")} waiting` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Committee, roles and what each person can edit",
    registration: registrationItem
      ? registrationItem.status === "complete"
        ? "Registration is on"
        : (registrationItem.detail ?? "Registration needs setting up")
      : "Booking, payment and entry",
    appearance: `${themeByKey(event.theme).name} colour · ${event.heroImageUrl ? "your own photograph" : "standard hero"}`,
    notifications: "Messages and announcements for residents",
    advanced: isSocietyAdmin ? "Run this event again, start another, society" : "Run this event again, start another",
  };

  // A link section is another page of the event; it is offered only where the server says this viewer may open it.
  const visibleSections = sectionDefs.filter(
    (section) => section.kind === "panel" || eventAccess?.pages.some((page) => page.pageKey === section.page && page.canView),
  );

  const dashboardVisibility = modules?.find((module) => module.pageKey === "dashboard");
  const hours = describeEventHours(event);
  const identityLine = [
    dateRangeLabel(event.startDate, event.endDate, formatEventDate),
    hours,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative isolate mx-auto max-w-5xl">
      {/* Soft ambient colour behind the page. The glass rows blur and saturate whatever is behind them, and on a
          flat off-white there is nothing to refract; these two washes, in the event's own colour, are it. */}
      <div aria-hidden="true" className="pointer-events-none absolute -inset-x-6 -top-8 -z-10 h-[44rem] overflow-x-clip [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
        <div className="absolute -left-24 top-28 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -right-16 top-72 h-80 w-80 rounded-full bg-accent blur-3xl" />
        <div className="absolute left-1/3 top-[26rem] h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      </div>
      {/* Compact header. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {selectedEventId ? (
            <Link
              to={path("/dashboard")}
              className="-ml-1 inline-flex min-h-10 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Back to event
            </Link>
          ) : null}
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">Event settings</h1>
          {selectedEventId ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span
                className={cn(
                  "mr-2 inline-block h-2 w-2 rounded-full align-middle",
                  status === "live" ? "bg-emerald-600" : status === "draft" || status === "cancelled" ? "bg-amber-600" : "bg-primary",
                )}
                aria-hidden="true"
              />
              {statusLabels[status]}
              {isDraft ? " · not visible to residents yet" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <DataSourceBadge source={data.source} reason={data.fallbackReason} />
          {selectedEventId && access.canEdit ? <OverflowMenu /> : null}
        </div>
      </div>

      {!session ? (
        <p className="mt-6 text-sm text-muted-foreground">Sign in with Google to create events and manage access.</p>
      ) : null}
      {session && !access.canEdit ? (
        <p className="mt-6 text-sm text-muted-foreground">
          You are signed in, but only an event admin can create events or manage member access.
        </p>
      ) : null}

      {selectedEventId && access.canEdit ? (
        <>
          {/* Compact identity: the event as a resident would meet it, from the event's own data. */}
          <div className="mt-5 flex items-center gap-3.5 border-y py-4">
            <EventArtwork
              eventType={event.eventType ?? "festival"}
              imageUrl={event.heroImageUrl}
              templateKey={event.templateKey}
              focus={heroFocus(event.heroOptions)}
              className="h-14 w-14 shrink-0 rounded-lg"
              iconClassName="h-6 w-6"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-xl leading-tight">{event.name}</p>
              {identityLine ? <p className="truncate text-sm text-muted-foreground">{identityLine}</p> : null}
              <p className="text-sm text-muted-foreground">
                {event.location?.trim() || "No venue yet"}
                {dashboardVisibility ? ` · Event page: ${visibilityLabels[dashboardVisibility.visibility].toLowerCase()}` : ""}
              </p>
            </div>
          </div>

          {headline.tone !== "none" ? (
            <ReadinessBlock
              headline={headline}
              gaps={gaps}
              dashboardHref={path("/dashboard")}
              pathFor={(page) => path(`/${page}`)}
              onSection={openSection}
            />
          ) : null}

          <div className="mt-2 lg:mt-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
            {/* The index on a phone; the side navigation from lg. */}
            <nav aria-label="Settings sections">
              <ul className="space-y-2.5">
                {visibleSections.map((section) => (
                  <SectionRow
                    key={section.key}
                    section={section}
                    summary={summaries[section.key]}
                    selected={section.kind === "panel" && shown === section.key}
                    unsaved={dirtySections.has(section.key)}
                    href={section.kind === "link" && section.page ? path(`/${section.page}`) : `?section=${section.key}`}
                  />
                ))}
              </ul>
            </nav>

            {/* Every panel stays mounted so a draft survives a visit elsewhere; only the open one is shown. */}
            <div
              ref={sheetRef}
              // aria-hidden + invisible while closed, so the panels that stay mounted for their drafts cannot be
              // tabbed into or read out. Visibility is transitioned with the transform, so it stays visible for the
              // whole slide out and only then is taken away.
              aria-hidden={active === null ? true : undefined}
              className={cn(
                "fixed inset-x-0 bottom-0 top-16 z-30 min-w-0 overflow-y-auto shadow-[12px_0_32px_-16px_hsl(var(--foreground)/0.35)] lg:shadow-none overscroll-contain bg-background px-4 pb-28 pt-3",
                "transition-[transform,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                active ? "visible translate-x-0" : "invisible -translate-x-full",
                // From lg the section sits beside the side navigation and is simply part of the page.
                "lg:visible lg:static lg:z-auto lg:translate-x-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:transition-none",
              )}
            >
              <Link
                to="?"
                onClick={(clicked) => {
                  clicked.preventDefault();
                  closeSection();
                }}
                className="-ml-1 mb-2 inline-flex min-h-10 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                All settings
              </Link>
              <FlatCards>
                {sectionDefs
                  .filter((section) => section.kind === "panel")
                  .map((section) => {
                    const open = shown === section.key;
                    const visibility = open ? "block" : "hidden";
                    return (
                      <section
                        key={section.key}
                        aria-labelledby={`settings-${section.key}`}
                        className={visibility}
                      >
                        <h2
                          id={`settings-${section.key}`}
                          ref={open ? headingRef : undefined}
                          tabIndex={-1}
                          className="font-display text-2xl leading-tight outline-none sm:text-3xl"
                        >
                          {section.title}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">{summaries[section.key]}</p>
                        <div className="mt-5">{panels(section.key, isSocietyAdmin)}</div>
                      </section>
                    );
                  })}
              </FlatCards>
            </div>
          </div>
        </>
      ) : null}

      {/* No event open: the only thing Settings can still do is start one. */}
      {!selectedEventId ? (
        <div className="mt-8">
          <CreateEventBlock signedIn={Boolean(session)} />
        </div>
      ) : null}
    </div>
  );
}

function panels(key: SectionKey, isSocietyAdmin: boolean): ReactNode {
  switch (key) {
    case "basics":
      return <EventDetailsCard part="basics" />;
    case "schedule":
      return (
        <>
          <EventDetailsCard part="schedule" />
          <GoodToKnowCard />
        </>
      );
    case "pages":
      return (
        <>
          <ModulesCard />
          <ShareCard />
          <AddressCard />
        </>
      );
    case "team":
      return <TeamPanel />;
    case "appearance":
      return <AppearanceCard />;
    case "advanced":
      return (
        <>
          <DuplicateEventCard />
          <CreateEventBlock signedIn />
          {isSocietyAdmin ? <SocietyCard /> : null}
        </>
      );
    default:
      return null;
  }
}

function SectionRow({
  section,
  summary,
  selected,
  unsaved,
  href,
}: {
  section: SectionDef;
  summary: string;
  selected: boolean;
  unsaved: boolean;
  href: string;
}) {
  const Icon = sectionIcons[section.key];
  const isLink = section.kind === "link";
  return (
    // A sheet of liquid glass (globals.css .glass), tinted by the event's colour when it is the open section on a
    // wide screen. The tile is the glass; the link inside is the hit area.
    <li className={cn("glass glass-press rounded-2xl", selected && "lg:glass-active")}>
      <Link
        to={href}
        aria-current={selected ? "true" : undefined}
        className="flex min-h-[3.75rem] items-center gap-3.5 rounded-2xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/60 text-muted-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.9)]",
            selected && "lg:text-primary",
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block font-medium leading-snug", selected && "lg:font-semibold")}>
            {section.title}
            {unsaved ? (
              <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-medium text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden="true" />
                Unsaved
              </span>
            ) : null}
          </span>
          <span className="block truncate text-sm text-muted-foreground lg:hidden">{summary}</span>
        </span>
        {isLink ? (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground lg:hidden" aria-hidden="true" />
        )}
      </Link>
    </li>
  );
}

function ReadinessBlock({
  headline,
  gaps,
  className,
  dashboardHref,
  pathFor,
  onSection,
}: {
  headline: { tone: "ready" | "attention" | "none"; text: string };
  gaps: { key: string; label: string; detail?: string; page?: string; status: "complete" | "missing" | "optional" }[];
  className?: string;
  dashboardHref: string;
  pathFor: (page: string) => string;
  onSection: (section: SectionKey) => void;
}) {
  const attention = headline.tone === "attention";
  const rowClass =
    "flex min-h-11 w-full items-center gap-3 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  return (
    <div className={cn("border-b py-3", className)} role="status">
      <p className={cn("flex items-center gap-2 text-sm font-medium", attention ? "text-amber-900" : "text-emerald-800")}>
        {attention ? <AlertCircle className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
        {headline.text}
      </p>
      {attention ? (
        <ul className="mt-1 divide-y">
          {gaps.map((gap) => {
            const target: ReadinessTarget | null = readinessTarget(gap);
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{gap.label}</span>
                  {gap.detail ? <span className="block text-xs text-muted-foreground">{gap.detail}</span> : null}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </>
            );
            return (
              <li key={gap.key}>
                {target?.kind === "section" ? (
                  <button type="button" className={rowClass} onClick={() => onSection(target.section)}>
                    {body}
                  </button>
                ) : target?.kind === "page" ? (
                  <Link to={pathFor(target.page)} className={rowClass}>
                    {body}
                  </Link>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Every check passes.{" "}
          <Link to={dashboardHref} className="font-medium text-primary underline-offset-4 hover:underline">
            Publish from the event page
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function OverflowMenu() {
  const path = useEventPath();
  const item =
    "flex w-full items-center gap-2 rounded-sm px-2 py-2.5 text-sm outline-none hover:bg-muted focus:bg-muted";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="More actions">
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={`z-50 w-56 rounded-xl border p-1.5 text-popover-foreground ${menuGlass}`}>
          <DropdownMenu.Item asChild>
            <Link to={path("/dashboard")} className={item}>
              Open the event page
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link to={path("/command")} className={item}>
              Command centre
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link to={path("/customise-dashboard")} className={item}>
              Arrange the dashboard
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Creating an event is not a setting of this one; it is only here so it is not lost. Same link as before. */
function CreateEventBlock({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="border-t py-7 first:border-t-0 first:pt-1">
      <h3 className="font-display text-xl leading-tight">Start another event</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Start from a festival, a sports meet, a cultural night or a blank slate, then turn modules on and off before
        anybody sees it.
      </p>
      <div className="mt-4">
        <Button asChild disabled={!signedIn}>
          <Link to="/new-event">New event</Link>
        </Button>
      </div>
      {!signedIn ? <p className="mt-2 text-sm text-muted-foreground">Sign in to create an event.</p> : null}
    </div>
  );
}
