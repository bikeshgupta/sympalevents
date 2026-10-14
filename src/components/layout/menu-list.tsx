import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { IconTile } from "@/features/settings/ios-list";
import type { SectionTone } from "@/features/settings/settings-sections";

/**
 * The account menu in the iOS grouped style: who you are on top, then one rounded white list of actions, each with a
 * small coloured icon tile. The menus keep their items, order, handlers and permissions; this only draws them.
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

/** A rounded white list inside the menu. Its children are the menu items (use `menuRow` and `MenuTile`). */
export function MenuList({ children }: { children: ReactNode }) {
  return (
    <div
      className="ios-list overflow-hidden rounded-2xl bg-white/85 shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] ring-1 ring-black/[0.05]"
      style={{ ["--ios-inset" as string]: "3.25rem" } as CSSProperties}
    >
      {children}
    </div>
  );
}

export const menuRow =
  "flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-[15px] outline-none transition-colors focus:bg-black/[0.05] data-[highlighted]:bg-black/[0.05] active:bg-black/[0.06]";

export function MenuTile({ icon, tone }: { icon: LucideIcon; tone: SectionTone }) {
  return <IconTile icon={icon} tone={tone} size="sm" />;
}
