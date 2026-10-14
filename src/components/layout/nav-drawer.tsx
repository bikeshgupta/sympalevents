import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Eye, LogIn, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { NavList } from "@/components/layout/nav-list";
import { ListGroup, ListRow } from "@/features/settings/ios-list";
import { signOut, type AuthSession } from "@/lib/auth";
import type { navItems } from "./nav-items";
import { overlayGlass } from "@/lib/glass";

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
  grouped,
  session,
  userName,
  onEditName,
  viewSwitch,
}: {
  items: typeof navItems;
  /** Fold the organiser's pages into groups - see nav-groups.ts. */
  grouped: boolean;
  session: AuthSession | null | undefined;
  userName: string;
  /** Opens the name editor, which the layout owns so the header dropdown and
   *  this drawer share one dialog rather than a copy each. */
  onEditName: () => void;
  /** An organiser's switch to the resident's view; absent for everybody else. */
  viewSwitch?: { isPreview: boolean; onToggle: () => void };
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
        <DialogPrimitive.Overlay className={`fixed inset-0 z-50 ${overlayGlass}`} />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-[min(21rem,88vw)] flex-col bg-[hsl(42_26%_94%)] shadow-[-12px_0_32px_-16px_hsl(var(--foreground)/0.35)] outline-none duration-300 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          {/* The same grouped lists as Event Settings: who you are, then the pages, then sign out. */}
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <DialogPrimitive.Title className="font-display text-xl">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="glass glass-press relative inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="relative z-10 h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Your account, and every page you have access to.
          </DialogPrimitive.Description>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {/* Who you are, first. */}
            {session ? (
              <ListGroup>
                <ListRow
                  big
                  lead={
                    session.user.avatarUrl ? (
                      <img
                        src={session.user.avatarUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-full border object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-muted text-base font-semibold"
                      >
                        {(userName[0] ?? "U").toUpperCase()}
                      </span>
                    )
                  }
                  title={userName}
                  sub={session.user.email ?? undefined}
                  onClick={() => {
                    close();
                    onEditName();
                  }}
                />
              </ListGroup>
            ) : (
              <ListGroup footer="You are browsing as a guest. Sign in to see the pages the committee has given you.">
                <ListRow icon={LogIn} tone="blue" title="Sign in with Google" href="/login" onLinkClick={close} />
              </ListGroup>
            )}

            {viewSwitch ? (
              <ListGroup>
                <ListRow
                  icon={Eye}
                  tone="gray"
                  title={viewSwitch.isPreview ? "Exit resident view" : "View as resident"}
                  chevron={false}
                  onClick={() => {
                    close();
                    viewSwitch.onToggle();
                  }}
                />
              </ListGroup>
            ) : null}

            <nav aria-label="Pages" className="mt-6">
              {items.length ? (
                <NavList items={items} grouped={grouped} onNavigate={close} />
              ) : (
                <p className="mt-6 px-2 text-sm text-muted-foreground">No pages are open to you on this event yet.</p>
              )}
            </nav>

            {session ? (
              <ListGroup>
                <ListRow
                  icon={LogOut}
                  tone="red"
                  title="Sign out"
                  chevron={false}
                  onClick={() => {
                    close();
                    void signOut();
                  }}
                />
              </ListGroup>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
