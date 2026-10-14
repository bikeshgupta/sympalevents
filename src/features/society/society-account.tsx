import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, UserPen } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth";
import type { SocietyOption } from "@/lib/event-context";

/**
 * Who is looking at this society - and what they can do here.
 *
 * Society Home sits outside AppLayout on purpose (a society is not an event), which meant it also sat
 * outside the only header in the app that carries the account menu: a signed-in committee member saw no
 * sign of who they were signed in as, and a signed-out visitor had no way to sign in from here at all.
 *
 * This is the profile, with the person's role in THIS society straight after their name, and - underneath
 * it, because they are things this person can do - the actions their role allows (`children`).
 * The role is a label, never a permission: what each action does is still decided by the server.
 */

const roleLabels: Record<SocietyOption["role"], string> = {
  admin: "Society Admin",
  committee: "Committee",
  read_only: "Resident",
};

export function SocietyAccount({
  role,
  children,
}: {
  /** The viewer's role in this society; null while it is still loading, or when they have none. */
  role: SocietyOption["role"] | null;
  /** The actions this role allows. Rendered under the profile; nothing is drawn when there are none. */
  children?: ReactNode;
}) {
  const { data: session, isLoading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  // Never flash "Sign in" at somebody who is signed in while the session is still being read.
  if (isLoading) {
    return <div className="h-[58px] animate-pulse rounded-2xl border bg-muted/40" aria-hidden="true" />;
  }

  if (!session) {
    return (
      <section aria-label="Your account" className="flex items-center gap-3 rounded-2xl border bg-card p-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Sign in to register, see your passes and take part.</p>
        <Button asChild size="sm" className="h-10 shrink-0">
          <Link to="/login" state={{ from: location.pathname }}>
            Sign in
          </Link>
        </Button>
      </section>
    );
  }

  const name = session.user.name ?? session.user.email ?? "Signed in";
  const hasActions = Boolean(children);

  return (
    <section aria-label="Your account" className="rounded-2xl border bg-card">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {session.user.avatarUrl ? (
              <img
                src={session.user.avatarUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full border object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-semibold"
              >
                {(name[0] ?? "U").toUpperCase()}
              </span>
            )}
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-semibold">{name}</span>
              {role ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {roleLabels[role]}
                </span>
              ) : null}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Account menu</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 w-64 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
          >
            <div className="px-2 py-2">
              <p className="truncate text-sm font-medium">{name}</p>
              {session.user.email ? <p className="mt-1 truncate text-xs text-muted-foreground">{session.user.email}</p> : null}
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2.5 text-sm outline-none hover:bg-muted"
                onClick={() => navigate("/profile")}
              >
                <UserPen className="h-4 w-4" aria-hidden="true" />
                My profile
              </button>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2.5 text-sm outline-none hover:bg-muted"
                onClick={() => void signOut()}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {hasActions ? <div className="flex flex-wrap gap-2 border-t px-3 py-3">{children}</div> : null}
    </section>
  );
}
