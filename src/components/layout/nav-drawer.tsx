import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LogIn, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOut, type AuthSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { navItems } from "./nav-items";

/**
 * The mobile navigation, as a right-hand drawer behind a three-line button in
 * the header, next to the profile picture.
 *
 * It replaced a fixed bottom bar that scrolled sideways: with thirteen pages
 * that bar showed about four of them at a time, gave no indication the rest
 * existed, and cost the last ~80px of every screen. The drawer shows the whole
 * list at once and costs nothing when closed - which is why the layout no
 * longer carries `pb-20`.
 *
 * Who is signed in comes first, because "which account am I looking at this
 * with" is the question a shared committee phone raises most often, and
 * signing out was previously buried in a desktop-width dropdown.
 *
 * Built on the Radix dialog primitives directly rather than `DialogContent`,
 * which is centred and sized for forms. Radix gives the focus trap, Escape,
 * scroll lock and `aria-modal` for free.
 */
export function NavDrawer({
  items,
  session,
  userName,
}: {
  items: typeof navItems;
  session: AuthSession | null | undefined;
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-[min(20rem,85vw)] flex-col border-l bg-card shadow-xl duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-semibold">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Your account, and every page you have access to.
          </DialogPrimitive.Description>

          {/* Who you are, first. */}
          {session ? (
            <div className="flex items-center gap-3 border-b px-4 py-3">
              {session.user.avatarUrl ? (
                <img
                  src={session.user.avatarUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full border object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-semibold">
                  {(userName[0] ?? "U").toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{userName}</p>
                {session.user.email ? (
                  <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-2 border-b px-4 py-3">
              <p className="text-sm text-muted-foreground">
                You are browsing as a guest. Sign in to see the pages the committee has given you.
              </p>
              <Button asChild className="w-full">
                <Link to="/login" onClick={close}>
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Sign in with Google
                </Link>
              </Button>
            </div>
          )}

          <nav aria-label="Pages" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
            {items.length ? (
              items.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  onClick={close}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                      isActive && "bg-accent text-primary",
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No pages are open to you on this event yet.
              </p>
            )}
          </nav>

          {session ? (
            <div className="border-t p-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  close();
                  void signOut();
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
