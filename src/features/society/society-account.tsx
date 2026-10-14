import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FilePenLine, LogOut, Plus, Settings2, UserPen } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth";
import type { SocietyOption } from "@/lib/event-context";

/**
 * Who is looking at this society.
 *
 * Society Home sits outside AppLayout on purpose (a society is not an event), which meant it also sat
 * outside the only header in the app that carries the account menu: a signed-in committee member saw no
 * sign of who they were, and a signed-out visitor had no way to sign in from here at all.
 *
 * It is a light line at the top RIGHT of the page - the avatar in the corner (as in the event pages' header),
 * the name and the person's role in THIS society to its left - with no box around it, so it reads as part of the page rather than as a widget on it. The role is a
 * label, never a permission: what each action does is still decided by the server.
 *
 * **The person's actions live in this menu**, not on the page: Create event, Manage society and Drafts only
 * appear for somebody the existing permissions allow (`canManage`, and society admin for Manage society), so
 * a resident's menu is just My profile and Sign out. A dot on the avatar says there are drafts waiting, so
 * tucking them in a menu does not hide that there is something to do.
 */

const roleLabels: Record<SocietyOption["role"], string> = {
  admin: "Society Admin",
  committee: "Committee",
  read_only: "Resident",
};

export function SocietyAccount({
  role,
  canManage,
  isSocietyAdmin,
  societySlug,
  draftCount,
  onShowDrafts,
}: {
  /** The viewer's role in this society; null while it is still loading, or when they have none. */
  role: SocietyOption["role"] | null;
  canManage: boolean;
  isSocietyAdmin: boolean;
  societySlug: string | null | undefined;
  /** Drafts this person can see; the item appears only when there are some. */
  draftCount: number;
  onShowDrafts: () => void;
}) {
  const { data: session, isLoading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  // Never flash "Sign in" at somebody who is signed in while the session is still being read.
  if (isLoading) return <div className="ml-auto h-10 w-40 animate-pulse rounded-full bg-muted/60" aria-hidden="true" />;

  if (!session) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Sign in to register, see your passes and take part.</p>
        <Button asChild size="sm" className="h-10 shrink-0">
          <Link to="/login" state={{ from: location.pathname }}>
            Sign in
          </Link>
        </Button>
      </div>
    );
  }

  const name = session.user.name ?? session.user.email ?? "Signed in";
  const hasDrafts = canManage && draftCount > 0;
  const item = "flex w-full items-center gap-2 rounded-sm px-2 py-2.5 text-sm outline-none hover:bg-muted focus:bg-muted";

  return (
    <DropdownMenu.Root>
      {/* Top right, where the event pages keep it: the avatar sits in the corner and the name and role read
          to its left. */}
      <div className="flex justify-end">
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="-mr-0.5 flex min-w-0 max-w-full items-center gap-2.5 rounded-full py-0.5 pl-3 pr-0.5 text-right data-[state=open]:bg-muted/60 [@media(hover:hover)]:hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex min-w-0 flex-col items-end">
              <span className="max-w-full truncate text-[15px] font-semibold leading-tight">{name}</span>
              {role ? (
                <span className="mt-0.5 whitespace-nowrap rounded-full bg-primary/10 px-2 py-px text-xs font-medium text-primary">{roleLabels[role]}</span>
              ) : null}
            </span>
            <span className="relative shrink-0">
              {session.user.avatarUrl ? (
                <img
                  src={session.user.avatarUrl}
                  alt=""
                  className="h-10 w-10 rounded-full border object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full border bg-muted text-sm font-semibold"
                >
                  {(name[0] ?? "U").toUpperCase()}
                </span>
              )}
              {hasDrafts ? (
                <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
              ) : null}
            </span>
            <span className="sr-only">Account menu</span>
          </button>
        </DropdownMenu.Trigger>
      </div>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <div className="px-2 py-2">
            <p className="truncate text-sm font-medium">{name}</p>
            {session.user.email ? <p className="mt-1 truncate text-xs text-muted-foreground">{session.user.email}</p> : null}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {canManage ? (
            <>
              <DropdownMenu.Item asChild>
                <Link to="/new-event" className={item}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create event
                </Link>
              </DropdownMenu.Item>
              {isSocietyAdmin && societySlug ? (
                <DropdownMenu.Item asChild>
                  <Link to={`/society/${societySlug}/admin`} className={item}>
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    Manage society
                  </Link>
                </DropdownMenu.Item>
              ) : null}
              {hasDrafts ? (
                <DropdownMenu.Item className={item} onSelect={onShowDrafts}>
                  <FilePenLine className="h-4 w-4" aria-hidden="true" />
                  <span>
                    Drafts · <span className="tabular-nums">{draftCount}</span>
                  </span>
                </DropdownMenu.Item>
              ) : null}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
            </>
          ) : null}
          <DropdownMenu.Item asChild>
            <button type="button" className={item} onClick={() => navigate("/profile")}>
              <UserPen className="h-4 w-4" aria-hidden="true" />
              My profile
            </button>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <button type="button" className={item} onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
