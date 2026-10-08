/**
 * Grouping an organiser's menu.
 *
 * Sixteen pages in a flat list is a wall: five of them are about money, four
 * about the programme, three about people. The organiser's menu now folds those
 * into **Registrations, Programme, Team and Finance**, each opening to its
 * pages. It is a *presentation* of the same list the server gave - every page
 * is still there, in the committee's own order within its group, and nothing is
 * hidden that the server allowed. A resident's menu is short and stays flat.
 *
 * A group of one is not a group: a heading over a single link is furniture, so
 * it is drawn as the plain link. Pure and import-free, so it is checked on its
 * own (tests/nav-groups.test.mjs).
 */

export type NavGroupDefinition = { key: string; label: string; pageKeys: string[] };

/** In the order they appear. A page in none of these still shows, after them. */
export const navGroupDefinitions: NavGroupDefinition[] = [
  { key: "start", label: "Event", pageKeys: ["command", "dashboard", "updates"] },
  { key: "registrations", label: "Registrations", pageKeys: ["registration", "gate"] },
  { key: "programme", label: "Programme", pageKeys: ["event-plan", "teams", "fixtures", "prasad"] },
  { key: "communications", label: "Communications", pageKeys: ["communications"] },
  { key: "team", label: "Team", pageKeys: ["tasks", "volunteers", "contacts"] },
  { key: "finance", label: "Finance", pageKeys: ["contributions", "sponsors", "budget", "expenses", "auctions"] },
  { key: "afterwards", label: "Afterwards", pageKeys: ["closing"] },
];

/** The first path segment of an href, which is its page key. */
export const pageKeyOf = (href: string) => href.split("/").filter(Boolean)[0] || "dashboard";

export type NavEntry<T> =
  | { type: "item"; item: T }
  | { type: "group"; key: string; label: string; items: T[] };

/**
 * `items` in the server's order, folded into groups.
 *
 * The first group (`start`) is never folded: the command centre, the event page
 * and Updates are where somebody begins, and hiding them behind a disclosure
 * would cost a tap on every visit.
 */
export function groupNavItems<T extends { href: string }>(items: T[]): NavEntry<T>[] {
  const entries: NavEntry<T>[] = [];
  const placed = new Set<T>();

  for (const definition of navGroupDefinitions) {
    const members = items.filter((item) => definition.pageKeys.includes(pageKeyOf(item.href)));
    members.forEach((item) => placed.add(item));
    if (!members.length) continue;

    if (definition.key === "start" || members.length === 1) {
      members.forEach((item) => entries.push({ type: "item", item }));
    } else {
      entries.push({ type: "group", key: definition.key, label: definition.label, items: members });
    }
  }

  // Anything this file has never heard of, and Settings, which belongs at the end.
  const rest = items.filter((item) => !placed.has(item));
  rest
    .filter((item) => pageKeyOf(item.href) !== "settings")
    .forEach((item) => entries.push({ type: "item", item }));
  rest
    .filter((item) => pageKeyOf(item.href) === "settings")
    .forEach((item) => entries.push({ type: "item", item }));

  return entries;
}

/** The group a page belongs to, so the one holding the current page can be open. */
export function groupKeyForPage(pageKey: string) {
  return navGroupDefinitions.find((definition) => definition.pageKeys.includes(pageKey))?.key ?? null;
}
