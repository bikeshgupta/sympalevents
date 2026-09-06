/**
 * Agenda points inside one scheduled event - "idol arrival", "sankalp and
 * sthapana", "prasad counter opens", or the running order of a cultural
 * evening.
 *
 * These live in `event_schedule.sub_events`, one point per line. There is
 * deliberately **no per-point timing**: the parent event already carries the
 * start/end time a resident needs, and asking a committee member to fill in
 * two clock fields per bullet was the reason this field went unused. A
 * plain textarea in, bullets out.
 *
 *   Idol arrival and welcome at the gate
 *   Sankalp and sthapana - Pandit ji leads
 *   Prasad counter opens
 *
 * Older rows were stored as `HH:MM | Title | Note`. Nothing in production
 * ever got that far (the column itself was missing), but the split below
 * still keeps such a line readable rather than printing raw pipes.
 */

/** Author order is the running order, so nothing here re-sorts the lines. */
export function parseAgenda(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/\r?\n/)
    .map((line) =>
      line
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" - "),
    )
    .filter(Boolean);
}
