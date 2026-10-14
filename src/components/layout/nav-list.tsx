import { ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { groupKeyForPage, groupNavItems, pageKeyOf, type NavEntry } from "@/components/layout/nav-groups";
import { useEventPath } from "@/lib/event-path";
import { pageKeyFromPath, routeSegmentFromPath } from "@/lib/page-access";
import { cn } from "@/lib/utils";

type Item = { label: string; href: string; icon: LucideIcon };

/**
 * The menu's links, for the sidebar and the mobile drawer alike: **one** rounded white panel with hairlines between
 * the rows and plain line icons, scrolling inside itself when the list is longer than the room.
 *
 * With `grouped` the organiser's menu folds into Registrations, Programme, Team and Finance (see nav-groups.ts); a
 * resident's stays a flat list. A fold opens in place, its pages as plain indented rows under it. The fold holding
 * the page being looked at opens by itself, so the menu always shows where you are, and any fold can be opened or
 * closed by hand.
 *
 * It was separate rounded lists with a coloured tile per page (the Settings look); that spent a lot of height on
 * gaps between lists, and twelve colours in a menu stopped meaning anything. The panel sizes to its content and
 * shrinks to fit (`min-h-0` in a flex column), so the caller decides how much room it has.
 */
export function NavList({
  items,
  grouped,
  onNavigate,
  className,
}: {
  items: Item[];
  grouped: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const path = useEventPath();
  const location = useLocation();
  const activeGroup = groupKeyForPage(pageKeyFromPath(location.pathname));
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  // The sidebar and the drawer are both in the page at once, so each fold's id carries this menu's own prefix.
  const idPrefix = useId();

  const entries: NavEntry<Item>[] = grouped ? groupNavItems(items) : items.map((item) => ({ type: "item", item }));

  // By the page's own segment, not the whole path: the same page has three address shapes (flat, /e/<id>,
  // /society/<s>/events/<e>) and the links are built in whichever one the event has. Not by page key either, which
  // folds aliases together (/updates is the dashboard's for access, but a different row here).
  const here = routeSegmentFromPath(location.pathname);
  const isCurrent = (item: Item) => pageKeyOf(item.href) === here;

  // A soft fade at the foot of the panel while there is more below, so a list cut off by the screen says so.
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const check = () => setMore(element.scrollTop + element.clientHeight < element.scrollHeight - 2);
    check();
    element.addEventListener("scroll", check, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", check);
      observer?.disconnect();
    };
  }, []);

  // Hover only where there is a hover: on a phone a tapped row would otherwise stay tinted like the current page.
  const press =
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-black/[0.05] [@media(hover:hover)]:hover:bg-black/[0.03]";

  const link = (item: Item) => {
    const current = isCurrent(item);
    return (
      <li key={item.href}>
        <Link
          to={path(item.href)}
          onClick={onNavigate}
          aria-current={current ? "page" : undefined}
          className={cn("flex min-h-11 items-center gap-3 px-4 py-2 text-[15px]", press, current && "bg-primary/10 font-semibold")}
        >
          <item.icon className={cn("h-[18px] w-[18px] shrink-0", current ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <div
      ref={scroller}
      className={cn(
        "relative min-h-0 shrink overflow-y-auto overscroll-contain rounded-[20px] bg-white shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] ring-1 ring-black/[0.04]",
        className,
      )}
    >
      {/* Hairlines start under the label, past the icon: 16px padding + 18px icon + 12px gap. */}
      <ul className="ios-list" style={{ ["--ios-inset" as string]: "2.875rem" } as CSSProperties}>
        {entries.map((entry) => {
          if (entry.type === "item") return link(entry.item);

          const open = chosen[entry.key] ?? entry.key === activeGroup;
          const panel = `${idPrefix}-group-${entry.key}`;
          // The fold wears its first page's icon: the group is that kind of thing, and a bare label reads as a heading.
          const Icon = entry.items[0].icon;
          return (
            <li key={entry.key}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panel}
                onClick={() => setChosen((current) => ({ ...current, [entry.key]: !open }))}
                className={cn("flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-[15px]", press)}
              >
                <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-300", open && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
              {/* Opens and closes smoothly: a one-row grid whose track goes from 0fr to 1fr, so the height follows
                  the content without measuring it. Closed, the pages stay in the DOM but are hidden from screen
                  readers and out of the tab order. */}
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <ul
                  id={panel}
                  aria-hidden={open ? undefined : true}
                  className={cn(
                    "ios-list min-h-0 overflow-hidden bg-black/[0.025] shadow-[inset_0_0.5px_0_hsl(var(--foreground)/0.14)] transition-opacity duration-300",
                    open ? "opacity-100" : "opacity-0",
                  )}
                  style={{ ["--ios-inset" as string]: "2.875rem" } as CSSProperties}
                >
                  {entry.items.map((item) => {
                    const current = isCurrent(item);
                    return (
                      <li key={item.href}>
                        <Link
                          to={path(item.href)}
                          onClick={onNavigate}
                          tabIndex={open ? undefined : -1}
                          aria-current={current ? "page" : undefined}
                          className={cn(
                            "flex min-h-10 items-center py-2 pl-[2.875rem] pr-4 text-[15px] text-foreground/85",
                            press,
                            current && "bg-primary/10 font-semibold text-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
      {more ? (
        <div aria-hidden="true" className="pointer-events-none sticky bottom-0 -mt-8 h-8 bg-gradient-to-t from-white to-white/0" />
      ) : null}
    </div>
  );
}
