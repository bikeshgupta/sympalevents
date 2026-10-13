/**
 * The catalogue of things that can go on a dashboard.
 *
 * This file is deliberately data, not components. The builder needs to list
 * every widget, and the dashboard needs to render them, but only one of those
 * two needs JSX - so the catalogue stays a plain `.ts` module and the
 * rendering lives in `src/features/dashboard/widget-host.tsx`. That also
 * keeps this importable from anywhere without dragging the dashboard's
 * component tree along with it.
 *
 * A widget's `module` is its access rule, and it is one that already exists:
 * `useEventAccess().pages` is the server-filtered list of pages this person
 * may open, so a widget whose module is switched off or not visible to them
 * is neither rendered nor offered. There is no second permission concept
 * here, and there should not be one.
 */

export type WidgetVariant = "basic" | "detailed";

export type WidgetDefinition = {
  key: string;
  /** Heading in the builder. The widget draws its own heading on the page. */
  title: string;
  /** One line in the "Add widget" list, saying what it puts on the page. */
  description: string;
  /**
   * The page key this widget belongs to, or null when it belongs to the
   * dashboard itself. A widget tied to a module disappears with it.
   */
  module: string | null;
  variants: WidgetVariant[];
  defaultVariant: WidgetVariant;
  /** `half` widgets pair up with the next one into a two-column row. */
  span: "full" | "half";
  /**
   * The grid classes for a row this widget starts, when it is a `half`. The
   * two pairs on the dashboard have different column ratios and one of them
   * needs `items-start`, so this is per-widget rather than a single shared
   * `lg:grid-cols-2`.
   */
  rowClass?: string;
  /** Widgets that cannot be removed. The hero is the page's front door. */
  required?: boolean;
};

export const widgetCatalogue: WidgetDefinition[] = [
  {
    key: "hero",
    title: "Event hero",
    description: "The event's name, photo, dates and countdown.",
    module: null,
    variants: ["basic"],
    defaultVariant: "basic",
    span: "full",
    required: true,
  },
  {
    key: "closing-summary",
    title: "Closing note",
    description: "The committee's thank-you note, once the event is closed.",
    module: "closing",
    variants: ["basic"],
    defaultVariant: "basic",
    span: "half",
    rowClass: "items-start lg:grid-cols-[1.1fr_1fr]",
  },
  {
    key: "closing-reviews",
    title: "In their words",
    description: "What residents wrote, and a box to add to it.",
    module: "closing",
    variants: ["basic"],
    defaultVariant: "basic",
    span: "half",
  },
  {
    key: "auctions",
    title: "Auctions",
    description: "The auction that is live or coming up, with its bidding.",
    module: "auctions",
    variants: ["basic"],
    defaultVariant: "basic",
    span: "full",
  },
  {
    key: "announcements",
    title: "News & announcements",
    description: "Notices the committee has posted.",
    module: null,
    variants: ["basic"],
    defaultVariant: "basic",
    span: "full",
  },
  {
    key: "financial-summary",
    title: "Financial summary",
    description: "Planned budget, funds received, spend and the gap.",
    module: null,
    variants: ["basic", "detailed"],
    defaultVariant: "detailed",
    span: "half",
    rowClass: "lg:grid-cols-[1fr_0.85fr]",
  },
  {
    key: "funding-progress",
    title: "Funding progress",
    description: "How close the money is to the budget, and who gave.",
    module: null,
    variants: ["basic", "detailed"],
    defaultVariant: "detailed",
    span: "half",
  },
  {
    key: "schedule",
    title: "Schedule",
    description: "What is happening, day by day, with each running order.",
    module: "event-plan",
    variants: ["basic", "detailed"],
    defaultVariant: "detailed",
    span: "full",
  },
  {
    key: "my-responsibilities",
    title: "My responsibilities",
    description: "The tasks assigned to whoever is looking.",
    module: "tasks",
    variants: ["basic"],
    defaultVariant: "basic",
    span: "full",
  },
  {
    key: "gallery",
    title: "Photographs",
    description: "A few photographs from the album.",
    module: "closing",
    variants: ["basic", "detailed"],
    // Six photographs, which is what this has always shown. "basic" is the
    // three-photograph form.
    defaultVariant: "detailed",
    span: "full",
  },
];

export const widgetByKey = new Map(widgetCatalogue.map((widget) => [widget.key, widget]));

/**
 * Who a widget is drawn for, chosen per widget by the committee.
 *
 *   auto       what the dashboard has always done - the default, and what an
 *              arrangement saved before this existed means;
 *   everyone   anybody who can open the dashboard, signed in or not;
 *   signed_in  anybody signed in;
 *   members    people with a role on the event (the committee, and read-only
 *              members), and nobody else.
 *
 * The three named choices are the same three the Page Visibility settings use.
 * This decides what the dashboard *draws* - it is presentation, like the
 * resident view. What each widget is allowed to *contain* is still the
 * server's call: amounts follow Collections, and a widget tied to a module is
 * drawn only where that module is open to the viewer.
 */
export type WidgetAudience = "auto" | "everyone" | "signed_in" | "members";

export const widgetAudiences: WidgetAudience[] = ["auto", "everyone", "signed_in", "members"];

/** How this viewer relates to the event, for the audience check. */
export type ViewerLevel = "guest" | "signed_in" | "member";

export type LayoutEntry = {
  key: string;
  variant: WidgetVariant;
  isVisible: boolean;
  /** Absent means `auto`. Stored only when somebody has chosen something else. */
  audience?: WidgetAudience;
};

/** Has the committee chosen who sees this, rather than leaving it to the defaults? */
export const hasChosenAudience = (entry: LayoutEntry) => Boolean(entry.audience && entry.audience !== "auto");

function audienceAllows(audience: WidgetAudience, viewer: ViewerLevel) {
  if (audience === "everyone") return true;
  if (audience === "signed_in") return viewer !== "guest";
  if (audience === "members") return viewer === "member";
  return true;
}

/**
 * The layout an event starts with, which is exactly the order the dashboard
 * has always rendered in.
 *
 * `isClosed` swaps two things, as it always has: the closing note and the
 * reviews appear under the hero, and the money drops below the schedule -
 * after the event, "how did it go" outranks "what is still unfunded".
 *
 * This is computed rather than stored, so an event with no saved layout is
 * not frozen to whatever the defaults were on the day it was created.
 */
export function defaultLayout(isClosed: boolean, eventType?: string): LayoutEntry[] {
  const money = ["financial-summary", "funding-progress"];
  const schedule = ["schedule"];

  const order = [
    "hero",
    ...(isClosed ? ["closing-summary", "closing-reviews"] : []),
    "auctions",
    "announcements",
    ...(isClosed || eventType === "cultural" || eventType === "sports" || eventType === "custom" ? [...schedule, ...money] : [...money, ...schedule]),
    "my-responsibilities",
    "gallery",
  ];

  return order.map((key) => ({
    key,
    variant: widgetByKey.get(key)?.defaultVariant ?? "basic",
    isVisible: true,
  }));
}

/**
 * A stored layout, made safe to render.
 *
 * Stored layouts are edited by people and outlive deploys, so all four of
 * these can happen and none of them should break the page:
 *   - a key that no longer exists (a widget was removed in a release);
 *   - a variant a widget no longer offers;
 *   - a widget added by a later deploy that the stored layout never heard of,
 *     which is appended rather than lost;
 *   - a required widget somebody managed to drop, which comes back at the top.
 */
export function normaliseLayout(stored: unknown, isClosed: boolean, eventType?: string): LayoutEntry[] {
  if (!Array.isArray(stored)) return defaultLayout(isClosed,eventType);

  const seen = new Set<string>();
  const entries: LayoutEntry[] = [];

  for (const raw of stored) {
    if (!raw || typeof raw !== "object") continue;
    const key = String((raw as Record<string, unknown>).key ?? "");
    const widget = widgetByKey.get(key);
    if (!widget || seen.has(key)) continue;
    seen.add(key);

    const variant = (raw as Record<string, unknown>).variant;
    const audience = (raw as Record<string, unknown>).audience;
    entries.push({
      key,
      variant: widget.variants.includes(variant as WidgetVariant)
        ? (variant as WidgetVariant)
        : widget.defaultVariant,
      isVisible: (raw as Record<string, unknown>).isVisible !== false,
      // Only a real choice is kept; anything else is "auto" and stays absent.
      ...(audience === "everyone" || audience === "signed_in" || audience === "members"
        ? { audience: audience as WidgetAudience }
        : {}),
    });
  }

  for (const widget of widgetCatalogue) {
    if (seen.has(widget.key)) continue;
    const entry = { key: widget.key, variant: widget.defaultVariant, isVisible: false };
    // A required widget is never merely absent - it goes back to the front.
    if (widget.required) entries.unshift({ ...entry, isVisible: true });
    else entries.push(entry);
  }

  return entries;
}

/**
 * The entries that will actually draw, given what this viewer may open.
 *
 * `openPageKeys` of `null` means "do not filter by module" - demo mode, where
 * there is no admin to have configured anything and nothing real to protect.
 *
 * A widget the committee has given an audience follows that choice, and the
 * old built-in rules for the money widgets (somebody must be able to open
 * Contributions, Sponsors, Budget or Expenses) step aside - the committee has
 * now said who sees it, and that is the more specific instruction. A widget
 * left on `auto` behaves exactly as it always has. Either way a widget tied to
 * a module is drawn only where that module is open to the viewer: its content
 * comes from that page's own access rules.
 */
export function visibleLayout(layout: LayoutEntry[], openPageKeys: Set<string> | null, viewer: ViewerLevel = "member") {
  return layout.filter((entry) => {
    if (!entry.isVisible) return false;
    const widget = widgetByKey.get(entry.key);
    if (!widget) return false;
    if (openPageKeys === null) return true;

    const chosen = hasChosenAudience(entry);
    if (chosen && !audienceAllows(entry.audience as WidgetAudience, viewer)) return false;

    if (
      !chosen &&
      ["financial-summary", "funding-progress"].includes(widget.key) &&
      !["contributions", "sponsors", "budget", "expenses"].some((key) => openPageKeys.has(key))
    ) {
      return false;
    }
    return widget.module === null || openPageKeys.has(widget.module);
  });
}

/**
 * Group consecutive `half` widgets into rows. A lone half renders full width
 * rather than half a row with a hole in it.
 */
export function layoutRows(entries: LayoutEntry[]): { rowClass?: string; entries: LayoutEntry[] }[] {
  const rows: { rowClass?: string; entries: LayoutEntry[] }[] = [];

  for (const entry of entries) {
    const widget = widgetByKey.get(entry.key);
    const last = rows[rows.length - 1];
    const isHalf = widget?.span === "half";

    if (isHalf && last && last.entries.length === 1 && widgetByKey.get(last.entries[0].key)?.span === "half") {
      last.entries.push(entry);
      continue;
    }
    rows.push({ rowClass: isHalf ? widget?.rowClass : undefined, entries: [entry] });
  }

  return rows;
}
