import { Activity, Building2, CalendarDays, ChartLine, LayoutDashboard, ScrollText, Users, type LucideIcon } from "lucide-react";

/**
 * The seven sections of the Platform Control Center, in menu order.
 *
 * `uses` names the data sources (keys of the `sources` probe in api/_lib/platform.ts) a section is built on, so a
 * section that is not built yet can still say, truthfully, which of its data exists today. `rangeAware` sections
 * show the date-range control; System reports the present moment and does not.
 */

export type PlatformSectionKey = "overview" | "users" | "societies" | "events" | "activity" | "analytics" | "system";

export type PlatformSection = {
  key: PlatformSectionKey;
  label: string;
  /** One line under the page title. Short on purpose. */
  summary: string;
  icon: LucideIcon;
  rangeAware: boolean;
  uses: string[];
  /** What the finished section will show, as short lines. Empty once the section is built. */
  plan: string[];
  /** The delivery phase that builds it (docs/platform-control-center.md). */
  phase: number;
};

export const platformSections: PlatformSection[] = [
  {
    key: "overview",
    label: "Overview",
    summary: "Growth, use and anything that needs you.",
    icon: LayoutDashboard,
    rangeAware: true,
    uses: ["people", "societies", "memberships", "events", "visits", "audit"],
    plan: [],
    phase: 2,
  },
  {
    key: "users",
    label: "Users",
    summary: "Everyone who has signed in, and how they use Sympal.",
    icon: Users,
    rangeAware: true,
    uses: ["people", "memberships", "event_roles", "visits", "last_seen"],
    plan: [],
    phase: 2,
  },
  {
    key: "societies",
    label: "Societies",
    summary: "Which societies are growing, active, quiet or empty.",
    icon: Building2,
    rangeAware: true,
    uses: ["societies", "memberships", "events", "visits"],
    plan: [],
    phase: 2,
  },
  {
    key: "events",
    label: "Events",
    summary: "Every event, from draft to completed.",
    icon: CalendarDays,
    rangeAware: true,
    uses: ["events", "bookings", "visits", "audit"],
    plan: [],
    phase: 2,
  },
  {
    key: "activity",
    label: "Activity & Audit",
    summary: "What people changed, what they opened, and who tried this page.",
    icon: ScrollText,
    rangeAware: true,
    uses: ["audit", "visits", "page_views"],
    plan: [
      "Recorded actions with read-only before-and-after values",
      "Visits to event pages, kept apart from recorded actions",
      "Attempts to open this area, allowed and refused",
    ],
    phase: 3,
  },
  {
    key: "analytics",
    label: "Analytics",
    summary: "Traffic, pages, retention and event activity.",
    icon: ChartLine,
    rangeAware: true,
    uses: ["visits", "page_views", "visit_surfaces", "bookings", "contributions"],
    plan: [
      "Visits, signed-in people and browsers, kept as separate measures",
      "Pages and features opened, once page views are recorded",
      "Retention of people who signed in, and bookings and contributions per event",
    ],
    phase: 3,
  },
  {
    key: "system",
    label: "System",
    summary: "Deployment, database and data sources, as observed.",
    icon: Activity,
    rangeAware: false,
    uses: [],
    plan: [],
    phase: 1,
  },
];

export const platformBasePath = "/platform/analytics";

export function sectionPath(key: PlatformSectionKey) {
  return `${platformBasePath}/${key}`;
}

export function sectionFromPath(pathname: string): PlatformSection {
  const segment = pathname.slice(platformBasePath.length).split("/").filter(Boolean)[0];
  return platformSections.find((section) => section.key === segment) ?? platformSections[0];
}
