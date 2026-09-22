import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, UserPen } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { AnnouncementsBell } from "@/components/layout/announcements-bell";
import { EventSwitcher } from "@/components/layout/event-switcher";
import { NavDrawer } from "@/components/layout/nav-drawer";
import { ProfileNameDialog } from "@/components/layout/profile-name-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth";
import { useEventAccess } from "@/lib/event-access";
import { useEventContext } from "@/lib/event-context";
import { useEventPath } from "@/lib/event-path";
import { useScrollToTopOnNavigate } from "@/lib/scroll";
import { themeVariables } from "@/lib/themes";
import { useEventData } from "@/lib/event-data";
import { cn } from "@/lib/utils";
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
  const eventPath = useEventPath();
  const { eventId: eventIdFromRoute } = useParams();

  // `/e/<eventId>/...` is the address that survives a refresh and can be
  // shared, so the path wins over whatever the switcher last remembered.
  // Selecting also persists it, which is what a link-borne id never did.
  useEffect(() => {
    if (eventIdFromRoute && eventIdFromRoute !== selectedEventId) {
      setSelectedEventId(eventIdFromRoute);
    }
  }, [eventIdFromRoute, selectedEventId, setSelectedEventId]);
  const event = data?.event;
  const userName = session?.user.name ?? session?.user.email ?? "Signed in";

  useScrollToTopOnNavigate();
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
  const orderedFromServer = accessiblePages
    .filter((page) => page.canView)
    .map((page) => navByPageKey.get(page.pageKey))
    .filter((item): item is (typeof navItems)[number] => Boolean(item));
  const visibleNavItems = (
    isDemoNav ? navItems : orderedFromServer
  ).map((item) => ({ ...item, label: labelByPageKey.get(pageKeyFromHref(item.href)) ?? item.label }));
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

  return (
    // The event's colour preset, set as CSS variables on the root rather than
    // by any second styling mechanism - every `bg-primary`, focus ring and
    // accent in the app is already reading these. A default-themed event sets
    // nothing at all, so it inherits globals.css untouched. See lib/themes.ts.
    <div className="min-h-screen bg-background" style={themeVariables(event?.theme)}>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card lg:block">
        {/* The society's own name and logo, when it has them. A deployment
            with no society yet falls back to the app's name, which is what
            this always said. */}
        <div className="flex h-16 items-center gap-2.5 border-b px-5">
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
              {society ? (event?.name ?? "Committee workspace") : "Committee workspace"}
            </p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.href}
              to={eventPath(item.href)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                  isActive && "bg-accent text-primary",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
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
          <AnnouncementsBell event={event} />
          {canRequestCommitteeAccess ? (
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
          session={session}
          userName={userName}
          onEditName={() => setEditingName(true)}
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
          {requestMessage ? (
            <div className="mb-4 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">{requestMessage}</div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
