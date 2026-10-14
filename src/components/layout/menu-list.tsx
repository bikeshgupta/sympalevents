import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { RowIcon } from "@/features/settings/ios-list";

/**
 * The account menu in the iOS grouped style: who you are on top, then one rounded white list of actions, each with a
 * plain line icon, the same as the page menu's. The menus keep their items, order, handlers and permissions; this only draws them.
 */

export function MenuIdentity({
  name,
  email,
  avatarUrl,
  badge,
}: {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  badge?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 px-2 pb-3 pt-2">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full border object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-muted text-base font-semibold"
        >
          {(name[0] ?? "U").toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold leading-tight">{name}</p>
        {email ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p> : null}
        {badge ? (
          <span className="mt-1 inline-block whitespace-nowrap rounded-full bg-primary/10 px-2 py-px text-xs font-medium text-primary">
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A rounded white list inside the menu. Its children are the menu items (use `menuRow` and `MenuIcon`). */
export function MenuList({ children }: { children: ReactNode }) {
  return (
    <div
      className="ios-list overflow-hidden rounded-2xl bg-white/85 shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] ring-1 ring-black/[0.05]"
      style={{ ["--ios-inset" as string]: "2.625rem" } as CSSProperties}
    >
      {children}
    </div>
  );
}

export const menuRow =
  "flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-[15px] outline-none transition-colors focus:bg-black/[0.05] data-[highlighted]:bg-black/[0.05] active:bg-black/[0.06]";

/** A menu item's icon. Sign out passes `destructive`, which also colours its words (see `menuRow`'s callers). */
export function MenuIcon({ icon, destructive = false }: { icon: LucideIcon; destructive?: boolean }) {
  return <RowIcon icon={icon} destructive={destructive} />;
}
