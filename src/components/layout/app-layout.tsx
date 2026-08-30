import { Bell, ChevronsUpDown, Search } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth";
import { useEventAccess } from "@/lib/event-access";
import { useEventContext } from "@/lib/event-context";
import { useEventData } from "@/lib/event-data";
import { cn } from "@/lib/utils";
import { mobileNavItems, navItems } from "./nav-items";

function pageKeyFromHref(href: string) {
  return href.split("/").filter(Boolean)[0] || "dashboard";
}

export function AppLayout() {
  const { data } = useEventData();
  const { data: session } = useSession();
  const { data: eventAccess } = useEventAccess();
  const { events, selectedEventId, setSelectedEventId } = useEventContext();
  const event = data?.event;
  const userName = session?.user.name ?? session?.user.email ?? "Signed in";
  const accessiblePages = Array.isArray(eventAccess?.pages) ? eventAccess.pages : [];
  const accessiblePageKeys = new Set(accessiblePages.filter((page) => page.canView).map((page) => page.pageKey));
  const visibleNavItems = navItems.filter((item) => accessiblePageKeys.has(pageKeyFromHref(item.href)));
  const visibleMobileNavItems = mobileNavItems.filter((item) => accessiblePageKeys.has(pageKeyFromHref(item.href)));
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

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card lg:block">
        <div className="flex h-16 items-center border-b px-5">
          <div>
            <p className="text-sm font-semibold">SymPal Events</p>
            <p className="text-xs text-muted-foreground">Committee workspace</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
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
            <div className="flex items-center gap-2">
              {events.length > 1 ? (
                <select
                  className="max-w-48 rounded-md border bg-background px-2 py-1 text-sm font-semibold outline-none"
                  value={selectedEventId}
                  onChange={(item) => setSelectedEventId(item.target.value)}
                >
                  {events.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              ) : (
                <h1 className="truncate text-sm font-semibold lg:text-base">{event?.name ?? "SymPal Events"}</h1>
              )}
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {event ? `${event.dates} · ${event.location}` : "Loading event"}
            </p>
          </div>
          <div className="hidden w-72 items-center gap-2 rounded-md border bg-card px-3 lg:flex">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input className="border-0 px-0 shadow-none focus-visible:ring-0" placeholder="Search event records" />
          </div>
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>
          {canRequestCommitteeAccess ? (
            <Button variant="outline" size="sm" onClick={() => void requestCommitteeAccess()}>
              Request access
            </Button>
          ) : null}
          {session ? (
            <div className="flex min-w-0 items-center gap-2">
              <div className="hidden min-w-0 text-right sm:block">
                <p className="max-w-36 truncate text-xs font-medium text-foreground">{userName}</p>
                {session.user.email && session.user.name ? (
                  <p className="max-w-36 truncate text-[11px] text-muted-foreground">{session.user.email}</p>
                ) : null}
              </div>
              <Button variant="secondary" size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-6">
          {requestMessage ? (
            <div className="mb-4 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">{requestMessage}</div>
          ) : null}
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card lg:hidden">
        {visibleMobileNavItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              cn("flex flex-col items-center gap-1 px-2 py-2 text-[11px] text-muted-foreground", isActive && "text-primary")
            }
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
        {accessiblePageKeys.has("settings") ? (
          <NavLink to="/settings" className="flex flex-col items-center gap-1 px-2 py-2 text-[11px] text-muted-foreground">
            <ChevronsUpDown className="h-5 w-5" />
            <span>More</span>
          </NavLink>
        ) : null}
      </nav>
    </div>
  );
}
