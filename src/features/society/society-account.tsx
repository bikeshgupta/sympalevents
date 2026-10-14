import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FilePenLine, LogOut, Plus, Settings2, UserPen } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth";
import type { SocietyOption } from "@/lib/event-context";
import { menuGlass } from "@/lib/glass";
import { MenuIdentity, MenuList, MenuTile, menuRow } from "@/components/layout/menu-list";

/**
 * Who is looking at this society.
 *
 * Society Home sits outside AppLayout on purpose (a society is not an event), which meant it also sat
 * outside the only header in the app that carries the account menu: a signed-in committee member saw no
 * sign of who they were, and a signed-out visitor had no way to sign in from here at all.
 *
 * Just the avatar, in the top RIGHT corner like the event pages' header, so it costs the page no row of its own.
 * Who they are and their role in THIS society are the first thing in the menu it opens. No box around it, so it reads as part of the page rather than as a widget on it. The role is a
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
  if (isLoading) return <div className="h-10 w-10 animate-pulse rounded-full bg-muted/60" aria-hidden="true" />;

  if (!session) {
    return (
      <Button asChild size="sm" className="h-10 shrink-0">
        <Link to="/login" state={{ from: location.pathname }}>
          Sign in
        </Link>
      </Button>
    );
  }

  const name = session.user.name ?? session.user.email ?? "Signed in";
  const hasDrafts = canManage && draftCount > 0;

  return (
    <DropdownMenu.Root>
      {/* Top right, where the event pages keep it: the avatar sits in the corner and the name and role read
          to its left. */}
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className="relative block shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
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
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={`z-50 w-64 rounded-xl border p-2 text-popover-foreground ${menuGlass}`}
        >
          <MenuIdentity name={name} email={session.user.email} avatarUrl={session.user.avatarUrl} badge={role ? roleLabels[role] : null} />
          <MenuList>
            {canManage ? (
              <>
                <DropdownMenu.Item asChild>
                  <Link to="/new-event" className={menuRow}>
                    <MenuTile icon={Plus} tone="green" />
                    Create event
                  </Link>
                </DropdownMenu.Item>
                {isSocietyAdmin && societySlug ? (
                  <DropdownMenu.Item asChild>
                    <Link to={`/society/${societySlug}/admin`} className={menuRow}>
                      <MenuTile icon={Settings2} tone="gray" />
                      Manage society
                    </Link>
                  </DropdownMenu.Item>
                ) : null}
                {hasDrafts ? (
                  <DropdownMenu.Item className={menuRow} onSelect={onShowDrafts}>
                    <MenuTile icon={FilePenLine} tone="orange" />
                    <span>
                      Drafts · <span className="tabular-nums">{draftCount}</span>
                    </span>
                  </DropdownMenu.Item>
                ) : null}
              </>
            ) : null}
            <DropdownMenu.Item asChild>
              <button type="button" className={menuRow} onClick={() => navigate("/profile")}>
                <MenuTile icon={UserPen} tone="blue" />
                My profile
              </button>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <button type="button" className={menuRow} onClick={() => void signOut()}>
                <MenuTile icon={LogOut} tone="red" />
                Sign out
              </button>
            </DropdownMenu.Item>
          </MenuList>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
