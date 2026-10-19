/**
 * How an event's committee has customised the credits on its closing page.
 *
 * Everything the page draws in "It took all of us" can be changed here: the
 * heading and the line under it, which groups appear and in what order, each
 * group's title and description, which names in a group are hidden, and extra
 * names for the groups the editor could not add to before (sponsors and
 * contributors). Stored as one jsonb object on `event_closing.credits_settings`
 * (migration 048), so a save is one row write.
 *
 * Pure and import-free on purpose: the API cleans what it is sent with
 * `cleanCreditsSettings` before storing it, and again on the way out (jsonb
 * stores anything, and a hand-edited row must not put a 4,000-character title
 * in front of every visitor); the page applies it with the same functions.
 * Covered by tests/credits-settings.test.mjs.
 *
 * `null` in the column is "exactly what the page has always drawn".
 */

export const creditGroupKeys = ["core", "volunteers", "prasad", "sponsors", "contributors"] as const;
export type CreditGroupKey = (typeof creditGroupKeys)[number];

export type CreditGroupSettings = {
  /** The whole group is left off the page. */
  hidden: boolean;
  /** Blank means the default title. */
  title: string;
  /** Blank means the default description. */
  blurb: string;
  /** `creditKey()`s of the people in this group who are not shown. */
  hiddenNames: string[];
  /** Names added by hand. Sponsors and contributors only - the committee and
   *  volunteer lists keep their own columns (020), and a prasad credit is a
   *  dish and a slot, not a name on its own. */
  extraNames: string[];
};

export type CreditsSettings = {
  /** Blank means "It took all of us". */
  heading: string;
  /** Blank means the counted line, "69 people made this happen." */
  subheading: string;
  /** Every group key exactly once, in the order the page shows them. */
  order: CreditGroupKey[];
  groups: Record<CreditGroupKey, CreditGroupSettings>;
};

export const defaultCreditsHeading = "It took all of us";

export const defaultGroupCopy: Record<CreditGroupKey, { title: string; blurb: string }> = {
  core: { title: "Core committee", blurb: "Planned it, chased it, and stayed till the lights went off." },
  volunteers: { title: "Volunteers", blurb: "Owned a task or a slot on the schedule and saw it through." },
  prasad: { title: "Prasad sponsors", blurb: "What each family brought, in the order it was served." },
  sponsors: { title: "Sponsors", blurb: "Backed a slot, an item, or a whole evening." },
  contributors: { title: "Contributors", blurb: "Every family who put money behind the celebration." },
};

export const groupsWithExtraNames: ReadonlySet<CreditGroupKey> = new Set(["sponsors", "contributors"]);

const MAX_HEADING = 80;
const MAX_SUBHEADING = 200;
const MAX_TITLE = 60;
const MAX_BLURB = 200;
const MAX_KEY = 200;
const MAX_NAME = 80;
const MAX_HIDDEN = 500;
const MAX_EXTRA = 200;

const squash = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * What identifies one person in a group: the name, and the flat where the
 * group has one (sponsors and contributors), so hiding one "Sharma" does not
 * hide the other Sharma in a different flat. Case and spacing do not matter.
 */
export function creditKey(name: string, flat = "") {
  const cleanName = squash(name, MAX_NAME).toLowerCase();
  const cleanFlat = squash(flat, MAX_NAME).toLowerCase();
  return cleanFlat ? `${cleanName}|${cleanFlat}` : cleanName;
}

function cleanList(value: unknown, max: number, itemMax: number, lower: boolean) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const text = squash(entry, itemMax);
    const item = lower ? text.toLowerCase() : text;
    const key = item.toLowerCase();
    if (!item || item === "-" || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function emptyGroup(): CreditGroupSettings {
  return { hidden: false, title: "", blurb: "", hiddenNames: [], extraNames: [] };
}

export function defaultCreditsSettings(): CreditsSettings {
  return {
    heading: "",
    subheading: "",
    order: [...creditGroupKeys],
    groups: Object.fromEntries(creditGroupKeys.map((key) => [key, emptyGroup()])) as Record<
      CreditGroupKey,
      CreditGroupSettings
    >,
  };
}

const isGroupKey = (value: unknown): value is CreditGroupKey =>
  typeof value === "string" && (creditGroupKeys as readonly string[]).includes(value);

/** Anything at all in, a complete and bounded `CreditsSettings` out. */
export function cleanCreditsSettings(value: unknown): CreditsSettings {
  const settings = defaultCreditsSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) return settings;
  const raw = value as Record<string, unknown>;

  settings.heading = squash(raw.heading, MAX_HEADING);
  settings.subheading = squash(raw.subheading, MAX_SUBHEADING);

  // Known keys once each, in the stored order; any the order forgot go last in
  // their usual place, so a group added by a later release never disappears.
  const stored = Array.isArray(raw.order) ? raw.order.filter(isGroupKey) : [];
  const order = [...new Set(stored)];
  for (const key of creditGroupKeys) if (!order.includes(key)) order.push(key);
  settings.order = order;

  const groups = (raw.groups && typeof raw.groups === "object" ? raw.groups : {}) as Record<string, unknown>;
  for (const key of creditGroupKeys) {
    const group = (groups[key] && typeof groups[key] === "object" ? groups[key] : {}) as Record<string, unknown>;
    settings.groups[key] = {
      hidden: group.hidden === true,
      title: squash(group.title, MAX_TITLE),
      blurb: squash(group.blurb, MAX_BLURB),
      hiddenNames: cleanList(group.hiddenNames, MAX_HIDDEN, MAX_KEY, true),
      extraNames: groupsWithExtraNames.has(key) ? cleanList(group.extraNames, MAX_EXTRA, MAX_NAME, false) : [],
    };
  }
  return settings;
}

/** True when nothing differs from the default - stored as `null`. */
export function isDefaultCreditsSettings(settings: CreditsSettings) {
  const plain = defaultCreditsSettings();
  return JSON.stringify(cleanCreditsSettings(settings)) === JSON.stringify(plain);
}

export function groupTitle(settings: CreditsSettings, key: CreditGroupKey) {
  return settings.groups[key].title || defaultGroupCopy[key].title;
}

export function groupBlurb(settings: CreditsSettings, key: CreditGroupKey) {
  return settings.groups[key].blurb || defaultGroupCopy[key].blurb;
}

/** Names with the group's hidden ones taken out. */
export function visibleNames(names: string[], group: CreditGroupSettings) {
  if (!group.hiddenNames.length) return names;
  const hidden = new Set(group.hiddenNames);
  return names.filter((name) => !hidden.has(creditKey(name)));
}

/** People (name + flat) with the group's hidden ones taken out and its extras added. */
export function visiblePeople<T extends { name: string; flat: string }>(
  people: T[],
  group: CreditGroupSettings,
  make: (name: string) => T,
) {
  const hidden = new Set(group.hiddenNames);
  const shown = people.filter((person) => !hidden.has(creditKey(person.name, person.flat)));
  const present = new Set(shown.map((person) => creditKey(person.name)));
  for (const name of group.extraNames) {
    if (!present.has(creditKey(name)) && !hidden.has(creditKey(name))) shown.push(make(name));
  }
  return shown;
}

/** Prasad credits with hidden sponsor names taken out, and a dish nobody is left on dropped. */
export function visiblePrasad<T extends { sponsors: string[] }>(entries: T[], group: CreditGroupSettings) {
  if (!group.hiddenNames.length) return entries;
  const hidden = new Set(group.hiddenNames);
  return entries
    .map((entry) => ({ ...entry, sponsors: entry.sponsors.filter((name) => !hidden.has(creditKey(name))) }))
    .filter((entry) => entry.sponsors.length > 0);
}
