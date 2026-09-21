import type { PageVisibility } from "@/lib/page-access";

/**
 * The five starting points a committee picks from when they create an event.
 *
 * These are code, not a database table, on purpose. A template is a default -
 * it decides nothing at runtime. The moment an event is created its modules
 * become ordinary rows in `event_page_visibility` that the committee edits
 * freely, and this file is never consulted again for that event. Keeping them
 * here means a template can be corrected in a deploy instead of a migration,
 * and there is no second permission question about who may publish one.
 *
 * If "save my event as a template" is ever wanted, that is a table, and this
 * file becomes its seed - the same relationship `src/data/credits.ts` has with
 * the stored credits.
 */

export type EventType = "festival" | "sports" | "cultural" | "mixed" | "custom";

export type ModuleSeed = {
  pageKey: string;
  isEnabled: boolean;
  visibility: PageVisibility;
  /** What this kind of event calls the module, when "Prasad" is the wrong word. */
  labelOverride?: string;
};

export type EventTemplate = {
  key: string;
  eventType: EventType;
  name: string;
  /** One line under the name in the picker. */
  tagline: string;
  /** Real examples, so somebody recognises their own event. */
  examples: string;
  /** The word this kind of event uses for the unit a person belongs to. */
  unitLabel: string;
  modules: ModuleSeed[];
};

/**
 * How the module list is grouped in the wizard and in Settings. Grouping is
 * presentation only - the server knows nothing about it.
 */
export const moduleGroups: { title: string; pageKeys: string[] }[] = [
  // The dashboard cannot be switched off - it is where every route lands - but
  // who may open it is very much a choice, so it has a group of its own.
  { title: "Front page", pageKeys: ["dashboard"] },
  { title: "Money", pageKeys: ["contributions", "sponsors", "budget", "expenses", "auctions"] },
  { title: "The event", pageKeys: ["event-plan", "teams", "fixtures", "prasad"] },
  { title: "People", pageKeys: ["tasks", "volunteers", "contacts"] },
  { title: "Afterwards", pageKeys: ["closing"] },
];

/**
 * The festival template reproduces exactly what an event gets today - the
 * visibility 015 seeds plus the code defaults in api/_lib/page-visibility.ts.
 * That is deliberate: it is the regression bar. An existing event opened on
 * this template must look like it always did.
 */
const festival: EventTemplate = {
  key: "festival",
  eventType: "festival",
  name: "Festival",
  tagline: "Contributions from every home, a day-wise programme, prasad and a closing album.",
  examples: "Ganesh, Navratri, Durga Puja, Diwali, Eid, Christmas",
  unitLabel: "Flat",
  modules: [
    { pageKey: "dashboard", isEnabled: true, visibility: "public" },
    { pageKey: "contributions", isEnabled: true, visibility: "restricted" },
    { pageKey: "sponsors", isEnabled: true, visibility: "restricted" },
    { pageKey: "budget", isEnabled: true, visibility: "public" },
    { pageKey: "expenses", isEnabled: true, visibility: "restricted" },
    { pageKey: "auctions", isEnabled: true, visibility: "public" },
    { pageKey: "prasad", isEnabled: true, visibility: "restricted" },
    { pageKey: "teams", isEnabled: false, visibility: "restricted" },
    { pageKey: "fixtures", isEnabled: false, visibility: "restricted" },
    { pageKey: "tasks", isEnabled: true, visibility: "authenticated" },
    { pageKey: "volunteers", isEnabled: true, visibility: "restricted" },
    { pageKey: "event-plan", isEnabled: true, visibility: "restricted" },
    { pageKey: "contacts", isEnabled: true, visibility: "restricted" },
    { pageKey: "closing", isEnabled: true, visibility: "public" },
  ],
};

const sports: EventTemplate = {
  key: "sports",
  eventType: "sports",
  name: "Sports meet",
  tagline: "Entry fees, a fixture list and results people can follow from the ground.",
  examples: "Box cricket, badminton, carrom, table tennis, athletics",
  unitLabel: "Team",
  modules: [
    { pageKey: "dashboard", isEnabled: true, visibility: "public" },
    { pageKey: "contributions", isEnabled: true, visibility: "restricted", labelOverride: "Entry fees" },
    { pageKey: "sponsors", isEnabled: true, visibility: "public" },
    { pageKey: "budget", isEnabled: true, visibility: "public" },
    { pageKey: "expenses", isEnabled: true, visibility: "restricted" },
    // Nothing is auctioned at a sports meet, and prasad is not a thing it has.
    { pageKey: "auctions", isEnabled: false, visibility: "restricted" },
    { pageKey: "prasad", isEnabled: false, visibility: "restricted" },
    { pageKey: "tasks", isEnabled: true, visibility: "authenticated" },
    { pageKey: "volunteers", isEnabled: true, visibility: "restricted" },
    { pageKey: "teams", isEnabled: true, visibility: "public" },
    { pageKey: "fixtures", isEnabled: true, visibility: "public" },
    { pageKey: "event-plan", isEnabled: true, visibility: "public", labelOverride: "Match days" },
    { pageKey: "contacts", isEnabled: false, visibility: "restricted" },
    { pageKey: "closing", isEnabled: true, visibility: "public", labelOverride: "Results & photos" },
  ],
};

const cultural: EventTemplate = {
  key: "cultural",
  eventType: "cultural",
  name: "Cultural night",
  tagline: "A running order, passes, and somewhere to put the photographs afterwards.",
  examples: "Annual day, talent show, music evening, drama night",
  unitLabel: "Flat",
  modules: [
    { pageKey: "dashboard", isEnabled: true, visibility: "public" },
    { pageKey: "contributions", isEnabled: true, visibility: "restricted", labelOverride: "Passes" },
    { pageKey: "sponsors", isEnabled: true, visibility: "public" },
    { pageKey: "budget", isEnabled: true, visibility: "public" },
    { pageKey: "expenses", isEnabled: true, visibility: "restricted" },
    { pageKey: "auctions", isEnabled: false, visibility: "restricted" },
    // The same module, doing the same job, under the word this event uses.
    { pageKey: "prasad", isEnabled: true, visibility: "restricted", labelOverride: "Refreshments" },
    { pageKey: "teams", isEnabled: false, visibility: "restricted" },
    { pageKey: "fixtures", isEnabled: false, visibility: "restricted" },
    { pageKey: "tasks", isEnabled: true, visibility: "authenticated" },
    { pageKey: "volunteers", isEnabled: true, visibility: "restricted" },
    { pageKey: "event-plan", isEnabled: true, visibility: "public", labelOverride: "Running order" },
    { pageKey: "contacts", isEnabled: false, visibility: "restricted" },
    { pageKey: "closing", isEnabled: true, visibility: "public", labelOverride: "Photos & reviews" },
  ],
};

const mixed: EventTemplate = {
  key: "mixed",
  eventType: "mixed",
  name: "Society day",
  tagline: "Everything on: a festival, games and a cultural evening in the same week.",
  examples: "Founder's week, society anniversary, summer carnival",
  unitLabel: "Flat",
  modules: [
    { pageKey: "dashboard", isEnabled: true, visibility: "public" },
    { pageKey: "contributions", isEnabled: true, visibility: "restricted" },
    { pageKey: "sponsors", isEnabled: true, visibility: "public" },
    { pageKey: "budget", isEnabled: true, visibility: "public" },
    { pageKey: "expenses", isEnabled: true, visibility: "restricted" },
    { pageKey: "auctions", isEnabled: true, visibility: "public" },
    { pageKey: "prasad", isEnabled: true, visibility: "restricted", labelOverride: "Hospitality" },
    { pageKey: "teams", isEnabled: false, visibility: "restricted" },
    { pageKey: "fixtures", isEnabled: false, visibility: "restricted" },
    { pageKey: "tasks", isEnabled: true, visibility: "authenticated" },
    { pageKey: "volunteers", isEnabled: true, visibility: "restricted" },
    { pageKey: "event-plan", isEnabled: true, visibility: "public", labelOverride: "Programme" },
    { pageKey: "contacts", isEnabled: true, visibility: "restricted" },
    { pageKey: "closing", isEnabled: true, visibility: "public" },
  ],
};

/**
 * Three modules and nothing else. For a committee who would rather start from
 * nothing than turn six things off.
 */
const blank: EventTemplate = {
  key: "blank",
  eventType: "custom",
  name: "Start blank",
  tagline: "A dashboard, a schedule and a task list. Add the rest yourself.",
  examples: "Anything that is not quite any of the above",
  unitLabel: "Flat",
  modules: [
    { pageKey: "dashboard", isEnabled: true, visibility: "public" },
    { pageKey: "contributions", isEnabled: false, visibility: "restricted" },
    { pageKey: "sponsors", isEnabled: false, visibility: "restricted" },
    { pageKey: "budget", isEnabled: false, visibility: "restricted" },
    { pageKey: "expenses", isEnabled: false, visibility: "restricted" },
    { pageKey: "auctions", isEnabled: false, visibility: "restricted" },
    { pageKey: "prasad", isEnabled: false, visibility: "restricted" },
    { pageKey: "teams", isEnabled: false, visibility: "restricted" },
    { pageKey: "fixtures", isEnabled: false, visibility: "restricted" },
    { pageKey: "tasks", isEnabled: true, visibility: "authenticated" },
    { pageKey: "volunteers", isEnabled: false, visibility: "restricted" },
    { pageKey: "event-plan", isEnabled: true, visibility: "restricted" },
    { pageKey: "contacts", isEnabled: false, visibility: "restricted" },
    { pageKey: "closing", isEnabled: false, visibility: "restricted" },
  ],
};

export const eventTemplates: EventTemplate[] = [festival, sports, cultural, mixed, blank];

export function templateByKey(key: string) {
  return eventTemplates.find((template) => template.key === key);
}

export function enabledModuleCount(template: EventTemplate) {
  return template.modules.filter((module) => module.isEnabled).length;
}
