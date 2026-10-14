import { ChevronDown, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { groupKeyForPage, groupNavItems, pageKeyOf, type NavEntry } from "@/components/layout/nav-groups";
import { ListGroup, ListRow } from "@/features/settings/ios-list";
import type { SectionTone } from "@/features/settings/settings-sections";
import { useEventPath } from "@/lib/event-path";
import { pageKeyFromPath } from "@/lib/page-access";
import { cn } from "@/lib/utils";

type Item = { label: string; href: string; icon: LucideIcon };

/**
 * The menu's links, for the sidebar and the mobile drawer alike, drawn as the same iOS grouped lists Event Settings
 * uses: rounded white groups, a coloured icon tile per row, the current page tinted.
 *
 * With `grouped` the organiser's menu folds into Registrations, Programme and Finance (see nav-groups.ts); a
 * resident's stays a flat list. A group opens by itself when the page being looked at is inside it, so the menu
 * always shows where you are, and any group can be opened or closed by hand. Consecutive plain links share one list;
 * each fold is a list of its own.
 *
 * The tile's colour belongs to the page's group (a page of Finance is always the same colour), so it says
 * "what kind of thing" and not "which row".
 */

const groupTones: Record<string, SectionTone> = {
  start: "blue",
  registrations: "orange",
  programme: "red",
  communications: "pink",
  team: "indigo",
  finance: "green",
  afterwards: "orange",
};

const pageTones: Record<string, SectionTone> = {
  command: "indigo",
  dashboard: "blue",
  updates: "orange",
  settings: "gray",
};

function toneFor(item: Item, groupKey: string | null): SectionTone {
  const page = pageKeyOf(item.href);
  return pageTones[page] ?? (groupKey ? groupTones[groupKey] : null) ?? (groupTones[groupKeyForPage(page) ?? ""] as SectionTone | undefined) ?? "gray";
}

export function NavList({
  items,
  grouped,
  onNavigate,
}: {
  items: Item[];
  grouped: boolean;
  onNavigate?: () => void;
}) {
  const path = useEventPath();
  const location = useLocation();
  const activeGroup = groupKeyForPage(pageKeyFromPath(location.pathname));
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  const entries: NavEntry<Item>[] = grouped ? groupNavItems(items) : items.map((item) => ({ type: "item", item }));

  const isCurrent = (item: Item) => {
    const to = path(item.href);
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const row = (item: Item, groupKey: string | null) => (
    <ListRow
      key={item.href}
      icon={item.icon}
      tone={toneFor(item, groupKey)}
      title={item.label}
      href={path(item.href)}
      current={isCurrent(item)}
      onLinkClick={onNavigate}
      chevron={false}
    />
  );

  // Plain links that sit next to each other share one rounded list; a fold ends the run.
  const blocks: ReactNode[] = [];
  let run: Item[] = [];
  const flush = () => {
    if (!run.length) return;
    const members = run;
    run = [];
    blocks.push(<ListGroup key={`run-${blocks.length}`}>{members.map((item) => row(item, null))}</ListGroup>);
  };

  for (const entry of entries) {
    if (entry.type === "item") {
      run.push(entry.item);
      continue;
    }
    flush();
    const open = chosen[entry.key] ?? entry.key === activeGroup;
    blocks.push(
      <ListGroup key={entry.key}>
        <ListRow
          icon={entry.items[0].icon}
          tone={groupTones[entry.key] ?? "gray"}
          title={entry.label}
          chevron={false}
          expanded={open}
          onClick={() => setChosen((current) => ({ ...current, [entry.key]: !open }))}
          trailing={
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          }
        />
        {open ? entry.items.map((item) => row(item, entry.key)) : null}
      </ListGroup>,
    );
  }
  flush();

  return <>{blocks}</>;
}
