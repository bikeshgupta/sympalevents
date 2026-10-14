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
import { GroupedCards } from "@/components/ui/card";
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
  sectionGroups,
  type SectionTone,
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
import { usePageAccess, usePageVisibility } from "@/lib/page-access";
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

/** iOS Settings gives every row its own colour. Name -> the top and bottom of the tile's gradient. */
const tones: Record<SectionTone, [string, string]> = {
  blue: ["#5BA3FF", "#2F7CF6"],
  red: ["#FF7A6B", "#F0443A"],
  indigo: ["#8B8CF5", "#5A5BD6"],
  green: ["#5FD07F", "#2FB457"],
  orange: ["#FFB04D", "#F58A1F"],
  pink: ["#FF7AA8", "#EE4A86"],
  gray: ["#A7A9B2", "#7E808A"],
};

/** The grouped-list background. Opaque on purpose: the section sheet slides over the index and must hide it. */
const groupedBackground = "bg-[hsl(42_26%_94%)]";

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

  const hours = describeEventHours(event);
  const identityLine = [dateRangeLabel(event.startDate, event.endDate, formatEventDate), hours].filter(Boolean).join(" · ");
  const statusLine = `${statusLabels[status]}${isDraft ? " · not visible to residents yet" : ""}`;

  // The short thing on the right of each row. The longer sentence (`summaries`) is the open section's subtitle.
  const values: Partial<Record<SectionKey, string>> = {
    basics: eventTypeLabel(event.eventType ?? "festival"),
    schedule: dateRangeLabel(event.startDate, event.endDate, formatEventDate),
    pages: modules ? `${enabledModules.length} on` : undefined,
    team: roster ? plural(roster.length, "person", "people") : undefined,
    registration: registrationItem ? (registrationItem.status === "complete" ? "On" : "Off") : undefined,
    appearance: themeByKey(event.theme).name,
  };
  const gapIcons: Record<string, { icon: LucideIcon; tone: SectionTone }> = {
    details: { icon: CalendarDays, tone: "red" },
    hero: { icon: Palette, tone: "pink" },
    registration: { icon: Ticket, tone: "orange" },
    programme: { icon: CalendarDays, tone: "blue" },
  };
  const shownTitle = sectionDefs.find((section) => section.key === shown)?.title ?? "";

  return (
    <div
      className={cn(
        "relative mx-auto max-w-5xl",
        // On a phone the page is the iOS grouped screen: a warm grey, edge to edge, with white lists on it.
        "max-lg:-mx-4 max-lg:-mb-20 max-lg:-mt-5 max-lg:min-h-[calc(100dvh-4rem)] max-lg:px-4 max-lg:pb-28 max-lg:pt-5",
        "max-lg:bg-[hsl(42_26%_94%)]",
      )}
    >
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
        <div className="mt-5 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
          {/* The index on a phone; the side navigation from lg. */}
          <nav aria-label="Settings sections" className="min-w-0">
            <ListGroup>
              <ListRow
                href="?section=basics"
                title={event.name}
                big
                lead={
                  <EventArtwork
                    eventType={event.eventType ?? "festival"}
                    imageUrl={event.heroImageUrl}
                    templateKey={event.templateKey}
                    focus={heroFocus(event.heroOptions)}
                    className="h-14 w-14 shrink-0 rounded-2xl"
                    iconClassName="h-6 w-6"
                  />
                }
                sub={identityLine}
                sub2={
                  <>
                    <span
                      className={cn(
                        "mr-1.5 inline-block h-2 w-2 rounded-full align-middle",
                        status === "live" ? "bg-emerald-600" : status === "draft" || status === "cancelled" ? "bg-amber-600" : "bg-primary",
                      )}
                      aria-hidden="true"
                    />
                    {statusLine}
                  </>
                }
              />
            </ListGroup>

            {headline.tone === "attention" ? (
              <ListGroup
                header={headline.text}
                headerTone="attention"
                footer="Fix these before you publish. Each opens the place where it is set."
                role="status"
              >
                {gaps.map((gap) => {
                  const target = readinessTarget(gap);
                  const look = gapIcons[gap.key] ?? { icon: AlertCircle, tone: "orange" as SectionTone };
                  return (
                    <ListRow
                      key={gap.key}
                      icon={look.icon}
                      tone={look.tone}
                      title={gap.label}
                      sub={gap.detail}
                      href={target?.kind === "page" ? path(`/${target.page}`) : undefined}
                      onClick={target?.kind === "section" ? () => openSection(target.section) : undefined}
                    />
                  );
                })}
              </ListGroup>
            ) : headline.tone === "ready" ? (
              <ListGroup footer="Every check passes.">
                <ListRow icon={Check} tone="green" title={headline.text} value="Publish" href={path("/dashboard")} />
              </ListGroup>
            ) : null}

            {sectionGroups(visibleSections).map((group) => (
              <ListGroup key={group[0].key}>
                {group.map((section) => (
                  <ListRow
                    key={section.key}
                    icon={sectionIcons[section.key]}
                    tone={section.tone}
                    title={section.title}
                    value={values[section.key]}
                    selected={section.kind === "panel" && shown === section.key}
                    unsaved={dirtySections.has(section.key)}
                    external={section.kind === "link"}
                    href={section.kind === "link" && section.page ? path(`/${section.page}`) : `?section=${section.key}`}
                  />
                ))}
              </ListGroup>
            ))}
          </nav>

          {/* Every panel stays mounted so a draft survives a visit elsewhere; only the open one is shown. */}
          <div
            ref={sheetRef}
            // aria-hidden + invisible while closed, so the panels that stay mounted for their drafts cannot be
            // tabbed into or read out. Visibility is transitioned with the transform, so it stays visible for the
            // whole slide out and only then is taken away.
            aria-hidden={active === null ? true : undefined}
            className={cn(
              "fixed inset-x-0 bottom-0 top-16 z-30 min-w-0 overflow-y-auto overscroll-contain px-4 pb-28 pt-3",
              groupedBackground,
              "shadow-[12px_0_32px_-16px_hsl(var(--foreground)/0.35)]",
              "transition-[transform,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              active ? "visible translate-x-0" : "invisible -translate-x-full",
              // From lg the section sits beside the side navigation and is simply part of the page.
              "lg:visible lg:static lg:z-auto lg:translate-x-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none lg:transition-none",
            )}
          >
            {/* The phone's navigation bar: frosted glass, a back button and the section's name in the middle. */}
            <div className="sticky top-0 z-10 -mx-4 -mt-3 mb-4 flex h-14 items-center border-b border-black/[0.06] bg-[hsl(42_26%_94%/0.72)] px-4 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
              <Link
                to="?"
                onClick={(clicked) => {
                  clicked.preventDefault();
                  closeSection();
                }}
                className="glass glass-press relative z-10 inline-flex h-9 items-center gap-0.5 rounded-full pl-2 pr-3.5 text-[15px] font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
                Settings
              </Link>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 text-center text-base font-semibold">
                {shownTitle}
              </span>
            </div>
            <GroupedCards>
              {sectionDefs
                .filter((section) => section.kind === "panel")
                .map((section) => {
                  const open = shown === section.key;
                  return (
                    <section
                      key={section.key}
                      aria-labelledby={`settings-${section.key}`}
                      className={open ? "block" : "hidden"}
                    >
                      {/* The phone's bar already names the section; the heading stays for focus and screen readers. */}
                      <h2
                        id={`settings-${section.key}`}
                        ref={open ? headingRef : undefined}
                        tabIndex={-1}
                        className="sr-only font-display text-2xl leading-tight outline-none sm:text-3xl lg:not-sr-only lg:block"
                      >
                        {section.title}
                      </h2>
                      <p className="mb-5 mt-1 hidden text-sm text-muted-foreground lg:block">{summaries[section.key]}</p>
                      <div>{panels(section.key, isSocietyAdmin)}</div>
                    </section>
                  );
                })}
            </GroupedCards>
          </div>
        </div>
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

/** One rounded white list: rows touch, with a hairline between them that starts after the icon. */
function ListGroup({
  header,
  headerTone,
  footer,
  role,
  children,
}: {
  header?: string;
  headerTone?: "attention";
  footer?: string;
  role?: "status";
  children: ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-0" role={role}>
      {header ? (
        <p
          className={cn(
            "mb-1.5 px-4 text-[13px] uppercase tracking-wide",
            headerTone === "attention" ? "font-medium text-amber-800" : "text-muted-foreground",
          )}
        >
          {header}
        </p>
      ) : null}
      <ul className="ios-list overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] ring-1 ring-black/[0.04]">
        {children}
      </ul>
      {footer ? <p className="mt-1.5 px-4 text-[13px] leading-snug text-muted-foreground">{footer}</p> : null}
    </section>
  );
}

/**
 * A row in a list: a coloured icon tile (or a picture), the title, a short value on the right and a chevron.
 * It is a link when it has an `href`, a button when it has an `onClick`. On a wide screen the list is the side
 * navigation, so the value and chevron step aside and the open section is tinted.
 */
function ListRow({
  icon: Icon,
  tone,
  lead,
  title,
  sub,
  sub2,
  value,
  href,
  onClick,
  selected = false,
  unsaved = false,
  external = false,
  big = false,
}: {
  icon?: LucideIcon;
  tone?: SectionTone;
  lead?: ReactNode;
  title: string;
  sub?: string;
  sub2?: ReactNode;
  value?: string;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  unsaved?: boolean;
  external?: boolean;
  big?: boolean;
}) {
  const [top, bottom] = tones[tone ?? "gray"];
  const body = (
    <>
      {lead ??
        (Icon ? (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.12)]"
            style={{ background: `linear-gradient(180deg, ${top}, ${bottom})` }}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        ) : null)}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", big ? "font-display text-lg font-semibold leading-tight" : "text-[16.5px]", selected && "lg:font-semibold")}>
          {title}
          {unsaved ? (
            <span className="ml-2 inline-flex items-center gap-1 align-middle font-sans text-xs font-medium text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden="true" />
              Unsaved
            </span>
          ) : null}
        </span>
        {sub ? <span className="block truncate text-[13px] text-muted-foreground">{sub}</span> : null}
        {sub2 ? <span className="mt-0.5 block text-[13px] text-muted-foreground">{sub2}</span> : null}
      </span>
      {value ? (
        <span className="max-w-[45%] shrink-0 truncate text-base text-muted-foreground lg:hidden">{value}</span>
      ) : null}
      {external ? (
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 lg:hidden" aria-hidden="true" />
      )}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-3 px-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    big ? "min-h-[5rem] py-3" : "min-h-[3.5rem] py-2",
    "active:bg-black/[0.05] [@media(hover:hover)]:hover:bg-black/[0.03]",
    selected && "lg:bg-primary/10",
  );
  return (
    <li style={lead ? ({ ["--ios-inset" as string]: "5rem" } as React.CSSProperties) : undefined}>
      {href ? (
        <Link to={href} aria-current={selected ? "true" : undefined} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {body}
        </button>
      )}
    </li>
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
