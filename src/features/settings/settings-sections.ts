/**
 * The shape of Event Settings: which sections there are, what each one says about itself in one line, and where a
 * readiness gap should send somebody. Pure and import-free so it is covered by tests/settings-sections.test.mjs.
 *
 * The sections are organisational groups for controls that already existed. They add no setting, change no
 * permission and are not a second module system: which pages an event has is still `event_page_visibility`.
 */

export type SectionKey =
  | "basics"
  | "schedule"
  | "pages"
  | "team"
  | "registration"
  | "appearance"
  | "notifications"
  | "advanced";

/** "panel" opens in place; "link" is an existing page elsewhere in the app (Settings has no controls for it). */
export type SectionKind = "panel" | "link";

export type SectionDef = {
  key: SectionKey;
  title: string;
  kind: SectionKind;
  /** Which rounded list the row sits in on the index (1-based, in order). Presentation only. */
  group: number;
  /** For links: the page key whose route it opens, and who may see the row (the server's list decides). */
  page?: string;
};

export const sectionDefs: SectionDef[] = [
  { key: "basics", title: "Basics", kind: "panel", group: 1 },
  { key: "schedule", title: "Schedule & location", kind: "panel", group: 1 },
  { key: "pages", title: "Pages & access", kind: "panel", group: 1 },
  { key: "team", title: "Team & permissions", kind: "panel", group: 1 },
  { key: "registration", title: "Registration", kind: "link", page: "registration", group: 2 },
  { key: "appearance", title: "Appearance", kind: "panel", group: 2 },
  { key: "notifications", title: "Notifications", kind: "link", page: "communications", group: 2 },
  { key: "advanced", title: "Advanced", kind: "panel", group: 3 },
];

const keys = new Set<string>(sectionDefs.map((section) => section.key));

export function isSectionKey(value: string | null | undefined): value is SectionKey {
  return Boolean(value && keys.has(value));
}

/** Only panels can be opened in place; a link section in the address falls back to the index. */
export function isPanelKey(value: string | null | undefined): value is SectionKey {
  return isSectionKey(value) && sectionDefs.find((section) => section.key === value)?.kind === "panel";
}

export const defaultSection: SectionKey = "basics";

/** "14 Sept" or "14 - 16 Sept" from already-formatted ends; one day when they are the same. */
export function dateRangeLabel(start: string, end: string, format: (date: string) => string) {
  if (!start) return "";
  const from = format(start);
  if (!end || end === start) return from;
  return `${from} - ${format(end)}`;
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export type ReadinessLike = { key: string; label: string; status: "complete" | "missing" | "optional"; page?: string };

/** Where an unfinished readiness item is dealt with: a section of this page, or another page of the event. */
export type ReadinessTarget = { kind: "section"; section: SectionKey } | { kind: "page"; page: string };

/**
 * The readiness checklist names the page each gap is fixed on. Two of those are "settings" itself, so they land on
 * the section holding the control: the venue and dates are Schedule & location, the hero is Appearance. Everything
 * else is another page and is linked there, exactly as the command centre links it.
 */
export function readinessTarget(item: ReadinessLike): ReadinessTarget | null {
  if (item.page === "settings") {
    if (item.key === "hero") return { kind: "section", section: "appearance" };
    return { kind: "section", section: "schedule" };
  }
  return item.page ? { kind: "page", page: item.page } : null;
}

export type ReadinessHeadline = { tone: "ready" | "attention" | "none"; text: string };

/**
 * One line from the real checklist, and nothing when there is nothing true to say. "Ready to publish" is only
 * ever said of a draft (a published event has already been through it); an event that is not a draft only ever
 * hears about gaps.
 */
export function readinessHeadline(items: ReadinessLike[] | undefined, isDraft: boolean): ReadinessHeadline {
  if (!items) return { tone: "none", text: "" };
  const missing = items.filter((item) => item.status === "missing").length;
  if (missing > 0) return { tone: "attention", text: `${plural(missing, "item")} ${missing === 1 ? "needs" : "need"} attention` };
  return isDraft ? { tone: "ready", text: "Ready to publish" } : { tone: "none", text: "" };
}

/**
 * Which section holds each card that can report unsaved changes (the ids are the ones the cards pass to
 * `useSettingsDirty`). A card not listed here is not counted against any section.
 */
const dirtySections: Record<string, SectionKey> = {
  "details:all": "schedule",
  "details:basics": "basics",
  "details:schedule": "schedule",
  "good-to-know": "schedule",
  modules: "pages",
  address: "pages",
  "member-access": "team",
  "hero-options": "appearance",
  duplicate: "advanced",
  society: "advanced",
};

export function sectionOfDirtyId(id: string): SectionKey | null {
  return dirtySections[id] ?? null;
}

/** The sections that currently hold unsaved changes, from the ids the cards have reported. */
export function dirtySectionKeys(ids: Iterable<string>): Set<SectionKey> {
  const result = new Set<SectionKey>();
  for (const id of ids) {
    const section = sectionOfDirtyId(id);
    if (section) result.add(section);
  }
  return result;
}

/** The index's rounded lists: sections split by `group`, in order, empty groups (a link the viewer cannot open) dropped. */
export function sectionGroups(sections: SectionDef[]): SectionDef[][] {
  const byGroup = new Map<number, SectionDef[]>();
  for (const section of sections) byGroup.set(section.group, [...(byGroup.get(section.group) ?? []), section]);
  return [...byGroup.keys()].sort((a, b) => a - b).map((key) => byGroup.get(key) as SectionDef[]);
}
