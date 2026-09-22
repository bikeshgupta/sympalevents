import * as DialogPrimitive from "@radix-ui/react-dialog";
import { LogIn, LogOut, Menu, UserPen, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOut, type AuthSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { navItems } from "./nav-items";

/**
 * The mobile navigation, as a right-hand drawer behind a round button at the
 * bottom right of the screen.
 *
 * It replaced a fixed bottom bar that scrolled sideways: with thirteen pages
 * that bar showed about four of them at a time and gave no indication the rest
 * existed. The drawer shows the whole list at once. Do not bring the bar back.
 *
 * The button sat in the header next to the profile picture until it became
 * clear that the top right corner is the hardest place on a phone for a thumb
 * to reach. It is now fixed to the bottom right, which is why `<main>` carries
 * `pb-20` again below `lg` - a floating button covers whatever scrolls under
 * it, and the last row of a page should not live beneath it. That is a much
 * smaller price than the full-width bar charged, and it buys a control anyone
 * can actually reach.
 *
 * **It must not be rendered inside the header.** The header carries
 * `backdrop-blur`, and a backdrop filter makes an element the containing block
 * for every `position: fixed` descendant - the button would anchor to the
 * header box and sit just below it rather than at the foot of the screen, with
 * no error to explain why. `AppLayout` renders this as a sibling after the
 * header instead, which also keeps it early enough in the DOM that a keyboard
 * reaches navigation before the page content.
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
  onEditName,
}: {
  items: typeof navItems;
  session: AuthSession | null | undefined;
  userName: string;
  /** Opens the name editor, which the layout owns so the header dropdown and
   *  this drawer share one dialog rather than a copy each. */
  onEditName: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        {/* Chrome, not a page action: card-coloured rather than primary, so it
            never reads as the "Add" button several screens already have in
            their own top right. 56px, comfortably over the 40px tap floor, and
            the bottom offset clears the iOS home indicator. */}
        <button
          type="button"
          aria-label="Open menu"
          className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border bg-card text-foreground shadow-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{userName}</p>
                {session.user.email ? (
                  <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Edit your name"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  close();
                  onEditName();
                }}
              >
                <UserPen className="h-4 w-4" aria-hidden="true" />
              </button>
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
