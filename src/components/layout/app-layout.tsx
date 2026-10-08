import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Eye, LogOut, UserPen, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { AnnouncementsBell } from "@/components/layout/announcements-bell";
import { EventSwitcher } from "@/components/layout/event-switcher";
import { NavDrawer } from "@/components/layout/nav-drawer";
import { NavList } from "@/components/layout/nav-list";
import { ProfileNameDialog } from "@/components/layout/profile-name-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth";
import { useEventAccess } from "@/lib/event-access";
import { useEventContext } from "@/lib/event-context";
import { useResolvedEventSlug } from "@/lib/event-slug";
import { useScrollToTopOnNavigate } from "@/lib/scroll";
import { useTrafficHeartbeat } from "@/lib/traffic";
import { themeVariables } from "@/lib/themes";
import { useEventData } from "@/lib/event-data";
import { isOrganiserPage } from "@/lib/resident-view";
import { useViewMode } from "@/lib/view-mode";
import { navItems } from "./nav-items";

function pageKeyFromHref(href: string) {
  return href.split("/").filter(Boolean)[0] || "dashboard";
}

export function AppLayout() {
  const { data } = useEventData();
  const { data: session } = useSession();
  const { data: eventAccess } = useEventAccess();
  const { selectedEvent, selectedEventId, societies, setSelectedEventId, isLoading: isEventLoading } =
    useEventContext();
  const { eventId: eventIdFromRoute, societySlug, eventSlug } = useParams();
  const location = useLocation();

  // A readable address has to become an id before any screen can load, and the
  // person opening it may have no account and no stored selection - so the
  // server answers it, publicly, the same way it answers a share token.
  const resolved = useResolvedEventSlug(societySlug, eventSlug);
  const eventIdFromPath = eventIdFromRoute ?? resolved.data?.eventId;

  // Whichever form the address takes, it wins over whatever the switcher last
  // remembered. Selecting also persists it, which is what a link-borne id
  // never did.
  useEffect(() => {
    if (eventIdFromPath && eventIdFromPath !== selectedEventId) {
      setSelectedEventId(eventIdFromPath);
    }
  }, [eventIdFromPath, selectedEventId, setSelectedEventId]);
  const event = data?.event;
  const userName = session?.user.name ?? session?.user.email ?? "Signed in";

  useScrollToTopOnNavigate();
  // One beat a minute while this tab is being looked at, so Settings can
  // say whether anybody reads what the committee maintains. Mounted here
  // rather than per page: /login, /new-event and /s/<token> are outside
  // this layout and belong to no event.
  useTrafficHeartbeat();
  const [editingName, setEditingName] = useState(false);
  const accessiblePages = Array.isArray(eventAccess?.pages) ? eventAccess.pages : [];
  // What this event calls each module. A sports meet's Contributions page is
  // "Entry fees" and its Events page is "Match days"; the nav says so, because
  // the server resolved it. Falls back to the app's own name.
  const labelByPageKey = new Map(
    accessiblePages.filter((page) => page.label).map((page) => [page.pageKey, page.label as string]),
  );
  // With no event there is nobody to have set visibility - the app is on the
  // demo dataset - so the nav shows the tour rather than going blank. With an
  // event, the server's list is the only thing that decides.
  const isDemoNav = !selectedEventId && !isEventLoading;
  // `navItems` supplies the icon and the href. The *order* is the committee's,
  // from the server's module list, so Settings -> Modules can rearrange the
  // sidebar and the drawer together. Anything the server did not name (the
  // demo tour, or Settings) keeps its place from the array.
  const navByPageKey = new Map(navItems.map((item) => [pageKeyFromHref(item.href), item]));
  const fromServer = accessiblePages
    .filter((page) => page.canView)
    .map((page) => navByPageKey.get(page.pageKey))
    .filter((item): item is (typeof navItems)[number] => Boolean(item));
  // Updates is not a module of its own: it is the history of what the home
  // page's announcements card shows a few of, so it is open to exactly whoever
  // may open that page and sits right under it.
  const updatesItem = navByPageKey.get("updates");
  const orderedFromServer = updatesItem
    ? fromServer.flatMap((item) => (pageKeyFromHref(item.href) === "dashboard" ? [item, updatesItem] : [item]))
    : fromServer;
  // A resident's menu is the pages for attending the event; the ones for
  // running it are left out. Presentation only: the server's list above is
  // still what decides what they may open, and a direct link still works.
  const view = useViewMode();
  const residentMenu = view.mode === "resident" && !isDemoNav;
  // The organiser's menu is folded into groups; a resident's is short enough to
  // stay flat, and the demo is a tour of everything.
  const groupMenu = !residentMenu && !isDemoNav;
  const visibleNavItems = (
    // The demo has no organisers, so no command centre to offer.
    isDemoNav ? navItems.filter((item) => !["/command", "/communications", "/updates"].includes(item.href)) : orderedFromServer
  )
    .filter((item) => !residentMenu || !isOrganiserPage(pageKeyFromHref(item.href)))
    .map((item) => {
      const pageKey = pageKeyFromHref(item.href);
      // What this event calls a page wins. Failing that, a resident's menu
      // speaks to somebody attending: "Home" and "Schedule", not "Overview"
      // and "Events".
      const residentLabel = residentMenu ? { dashboard: "Home", "event-plan": "Schedule" }[pageKey] : undefined;
      const label = labelByPageKey.get(pageKey) ?? residentLabel ?? item.label;
      return { ...item, label };
    });
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const canRequestCommitteeAccess = Boolean(
    session && selectedEventId && eventAccess.role !== "admin" && eventAccess.role !== "committee",
  );

  async function requestCommitteeAccess() {
    if (!selectedEventId) return;
    setRequestMessage("Sending request...");

    try {
      await apiFetch("/api/access-requests", {
        method: "POST",
        body: { eventId: selectedEventId },
      });
      setRequestMessage("Committee access requested.");
    } catch (error) {
      setRequestMessage(error instanceof Error ? error.message : "Unable to request access");
    }
  }

  const society = societies.find((item) => item.id === selectedEvent?.societyId) ?? null;

  // An old /e/<uuid> address becomes the readable one once this event's slugs
  // are known, so there is a single canonical address per page and nobody
  // re-shares the uuid form by accident. Every existing bookmark and share
  // token still resolves - it just does not stay in the address bar.
  //
  // After every hook above, deliberately: an early return placed higher would
  // change the hook order between renders.
  if (eventIdFromRoute && event?.slug && event?.societySlug) {
    const rest = location.pathname.replace(`/e/${eventIdFromRoute}`, "");
    return (
      <Navigate to={`/society/${event.societySlug}/events/${event.slug}${rest}${location.search}`} replace />
    );
  }


  return (
    // The event's colour preset, set as CSS variables on the root rather than
    // by any second styling mechanism - every `bg-primary`, focus ring and
    // accent in the app is already reading these. A default-themed event sets
    // nothing at all, so it inherits globals.css untouched. See lib/themes.ts.
    <div className="min-h-screen bg-background" style={themeVariables(event?.theme)}>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card lg:block">
        {/* The society's own name and logo, when it has them. A deployment
            with no society yet falls back to the app's name, which is what
            this always said.

            It is also the way back out: this block is where somebody already
            looks to answer "where am I", so it is the least surprising place
            to put "and how do I get back to the rest of it". Without a
            society there is nowhere to go back to, so it stays a plain block
            rather than a link that leads nowhere. */}
        <SocietyBrand society={society} eventName={event?.name} resident={residentMenu} />
        <nav aria-label="Pages" className="space-y-1 p-3">
          <NavList items={visibleNavItems} grouped={groupMenu} variant="sidebar" />
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          {/* The app icon is the way home: every event in the society, not
              just the one open. Its own link, so the event title beside it can
              be a pure switcher. */}
          <Link
            to={society?.slug ? `/society/${society.slug}` : "/society"}
            aria-label="All events"
            title="All events"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-md" />
          </Link>
          <div className="min-w-0 flex-1">
            <EventSwitcher
              eventName={event?.name ?? "SymPal Events"}
              eventSubtitle={
                selectedEvent?.societyName
                  ? `${selectedEvent.societyName} · ${event?.dates ?? ""}`
                  : event
                    ? `${event.dates} · ${event.location}`
                    : "Loading event"
              }
            />
          </div>
          {/* Only somebody with a role on the event can look at it the way a
              resident does. On a phone the same switch is in the drawer. */}
          {view.isOrganiser ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden h-10 gap-1.5 text-xs sm:inline-flex"
              aria-pressed={view.isPreview}
              onClick={() => view.setPreview(!view.isPreview)}
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              {view.isPreview ? "Exit resident view" : "View as resident"}
            </Button>
          ) : null}
          <AnnouncementsBell event={event} announcements={data.announcements} />
          {/* A resident is not being asked to join the committee in the header;
              for them the request lives in the account menu. */}
          {canRequestCommitteeAccess && !residentMenu ? (
            <Button variant="outline" size="sm" onClick={() => void requestCommitteeAccess()}>
              Request access
            </Button>
          ) : null}
          {session ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted"
                >
                  {session.user.avatarUrl ? (
                    <img
                      src={session.user.avatarUrl}
                      alt=""
                      className="h-8 w-8 rounded-full border object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-xs font-semibold">
                      {(userName[0] ?? "U").toUpperCase()}
                    </span>
                  )}
                  <span className="hidden max-w-32 truncate text-xs font-medium text-foreground sm:block">{userName}</span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 w-64 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
                >
                  <div className="px-2 py-2">
                    <p className="truncate text-sm font-medium">{userName}</p>
                    {session.user.email ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{session.user.email}</p>
                    ) : null}
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <DropdownMenu.Item asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none hover:bg-muted"
                      onClick={() => setEditingName(true)}
                    >
                      <UserPen className="h-4 w-4" />
                      Edit your name
                    </button>
                  </DropdownMenu.Item>
                  {canRequestCommitteeAccess && residentMenu ? (
                    <DropdownMenu.Item asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none hover:bg-muted"
                        onClick={() => void requestCommitteeAccess()}
                      >
                        <UserPlus className="h-4 w-4" />
                        Request committee access
                      </button>
                    </DropdownMenu.Item>
                  ) : null}
                  <DropdownMenu.Item asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none hover:bg-muted"
                      onClick={() => void signOut()}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            // On a phone this lives in the drawer, under the account block -
            // two sign-in buttons a thumb apart would be noise.
            <Button variant="secondary" size="sm" asChild className="hidden lg:inline-flex">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </header>

        {/* Deliberately outside the header. The header carries `backdrop-blur`,
            and a backdrop filter makes an element the containing block for
            every fixed-position descendant - the menu button would anchor to
            the header box and sit just beneath it instead of at the foot of
            the screen, with nothing to say why. Out here it anchors to the
            viewport.

            Its position in the DOM is still right after the header's own
            controls, so a keyboard or screen reader reaches navigation before
            the page content rather than after all of it. The dialog below is
            portalled, so where it sits makes no visual difference; it lives
            next to the drawer because the drawer is what opens it. */}
        <NavDrawer
          items={visibleNavItems}
          grouped={groupMenu}
          session={session}
          userName={userName}
          onEditName={() => setEditingName(true)}
          viewSwitch={view.isOrganiser ? { isPreview: view.isPreview, onToggle: () => view.setPreview(!view.isPreview) } : undefined}
        />
        {session && editingName ? (
          <ProfileNameDialog
            currentName={session.user.name ?? ""}
            email={session.user.email}
            onOpenChange={setEditingName}
          />
        ) : null}

        {/* `pb-20` below `lg` is the room the floating menu button needs; a
            page's last row would otherwise sit under it permanently. */}
        <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-5 lg:px-6 lg:pb-5">
          {view.isPreview ? (
            <div
              role="status"
              className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-accent px-4 py-2.5 text-sm"
            >
              <span>
                <span className="font-semibold">Resident view.</span> This is the shorter menu and home page a resident
                gets. Organiser tools are hidden.
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => view.setPreview(false)}>
                Back to organiser view
              </Button>
            </div>
          ) : null}
          {requestMessage ? (
            <div className="mb-4 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">{requestMessage}</div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * The sidebar's head: whose events these are, and which one you are in.
 *
 * A link back to the society when there is one to go back to, and the plain
 * block this always was when there is not (demo mode, or before the society
 * migrations have run). `/society` without a slug is the fallback: the server
 * resolves it to the viewer's own society, so this still works before 029
 * gives societies their addresses.
 */
function SocietyBrand({
  society,
  eventName,
  resident = false,
}: {
  society?: { name: string; slug: string | null; logoUrl: string | null } | null;
  eventName?: string;
  /** A resident is not looking at a committee workspace, so it does not say so. */
  resident?: boolean;
}) {
  const fallback = resident ? "Community event" : "Committee workspace";
  const inner = (
    <>
      {society?.logoUrl ? (
        <img
          src={society.logoUrl}
          alt=""
          className="h-8 w-8 shrink-0 rounded-md border object-cover"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{society?.name ?? "SymPal Events"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {society ? (eventName ?? fallback) : fallback}
        </p>
      </div>
    </>
  );

  if (!society) {
    return <div className="flex h-16 items-center gap-2.5 border-b px-5">{inner}</div>;
  }

  return (
    <Link
      to={society.slug ? `/society/${society.slug}` : "/society"}
      title={`All events at ${society.name}`}
      className="flex h-16 items-center gap-2.5 border-b px-5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {inner}
    </Link>
  );
}
