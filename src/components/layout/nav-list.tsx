import { ChevronDown, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { groupKeyForPage, groupNavItems, type NavEntry } from "@/components/layout/nav-groups";
import { useEventPath } from "@/lib/event-path";
import { pageKeyFromPath } from "@/lib/page-access";
import { cn } from "@/lib/utils";

type Item = { label: string; href: string; icon: LucideIcon };

/**
 * The menu's links, for the sidebar and the mobile drawer alike - they used to
 * carry a copy each.
 *
 * With `grouped` the organiser's menu folds into Registrations, Programme and
 * Finance (see nav-groups.ts); a resident's stays a flat list. A group opens by
 * itself when the page being looked at is inside it, so the menu always shows
 * where you are, and any group can be opened or closed by hand.
 *
 * The `variant` is only about size: the drawer's rows are taller because they
 * are for a thumb.
 */
export function NavList({
  items,
  grouped,
  variant,
  onNavigate,
}: {
  items: Item[];
  grouped: boolean;
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
}) {
  const path = useEventPath();
  const location = useLocation();
  const activeGroup = groupKeyForPage(pageKeyFromPath(location.pathname));
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  const entries: NavEntry<Item>[] = grouped ? groupNavItems(items) : items.map((item) => ({ type: "item", item }));

  const row = cn(
    "flex w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    variant === "drawer" ? "min-h-11 py-2" : "py-2",
  );

  const link = (item: Item) => (
    <NavLink
      key={item.href}
      to={path(item.href)}
      onClick={onNavigate}
      className={({ isActive }) => cn(row, isActive && "bg-accent text-primary")}
    >
      <item.icon className={cn("h-4 w-4", variant === "drawer" && "shrink-0")} aria-hidden="true" />
      {item.label}
    </NavLink>
  );

  return (
    <>
      {entries.map((entry) => {
        if (entry.type === "item") return link(entry.item);

        const open = chosen[entry.key] ?? entry.key === activeGroup;
        const panel = `nav-group-${entry.key}-${variant}`;
        return (
          <div key={entry.key}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panel}
              onClick={() => setChosen((current) => ({ ...current, [entry.key]: !open }))}
              className={cn(row, "justify-between")}
            >
              <span className="flex items-center gap-3">
                {/* The group wears its first page's icon: the group is that
                    kind of thing, and a bare label looks like a heading. */}
                {(() => {
                  const Icon = entry.items[0].icon;
                  return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />;
                })()}
                {entry.label}
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
            </button>
            {open ? (
              <div id={panel} className="ml-5 mt-0.5 space-y-0.5 border-l pl-2">
                {entry.items.map(link)}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
