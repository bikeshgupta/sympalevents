import { CalendarDays, Music2, Sparkles, Trophy, Users, type LucideIcon } from "lucide-react";

/**
 * Each kind of event's small visual identity: a word, an icon and a wash.
 *
 * A plain `.ts` module so both the artwork component and the pure
 * presentation helpers can read it without either importing the other, and
 * without a component file exporting functions (which trips react-refresh -
 * the same reason `src/lib/event-path.ts` exists).
 *
 * Deliberately quiet. A list of these has to read as one page, and the
 * committee's own theme is the colour that should carry weight on it - so each
 * type gets a pale gradient and a line icon, never a block of saturated
 * colour. Tailwind palette utilities, as the amber migration banners and
 * emerald status pills already use; nothing is fetched from anywhere.
 */

export type EventTypeStyle = {
  label: string;
  icon: LucideIcon;
  gradient: string;
  iconTint: string;
};

const styles: Record<string, EventTypeStyle> = {
  festival: {
    label: "Festival",
    icon: Sparkles,
    gradient: "from-amber-100 via-orange-100 to-rose-100",
    iconTint: "text-amber-700/70",
  },
  cultural: {
    label: "Cultural",
    icon: Music2,
    gradient: "from-violet-100 via-purple-100 to-indigo-100",
    iconTint: "text-violet-700/70",
  },
  sports: {
    label: "Sports",
    icon: Trophy,
    gradient: "from-emerald-100 via-teal-100 to-cyan-100",
    iconTint: "text-emerald-700/70",
  },
  mixed: {
    label: "Community",
    icon: Users,
    gradient: "from-sky-100 via-blue-100 to-indigo-100",
    iconTint: "text-sky-700/70",
  },
  custom: {
    label: "Event",
    icon: CalendarDays,
    gradient: "from-slate-100 via-slate-100 to-zinc-100",
    iconTint: "text-slate-600/70",
  },
};

/** An unknown type falls back to the neutral one rather than breaking - event
 *  types are a database column and may outgrow this map. */
export function eventTypeStyle(eventType: string): EventTypeStyle {
  return styles[eventType] ?? styles.custom;
}

/** The word a card puts in its eyebrow. Upper-cased by the caller. */
export function eventTypeLabel(eventType: string) {
  return eventTypeStyle(eventType).label;
}
