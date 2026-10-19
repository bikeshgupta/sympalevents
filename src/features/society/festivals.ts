/**
 * "Plan your next event" - the festivals coming up on the Indian calendar, for a society's organisers.
 *
 * Pure and import-free (tested in tests/festivals.test.mjs). Dates are calendar days, compared as
 * calendar days: the caller passes today's date in the event time zone (`getDateInEventZone`), so a
 * festival is "in 10 days" in India whatever the device's own zone is.
 *
 * The dates come from published 2026-27 holiday lists (Drik Panchang, the national holiday list). Regional
 * calendars can differ by a day, and a festival a society marks on a different day is still matched,
 * because "already planned" looks for an event with that festival's name within twelve days either side.
 * **This list has to be extended once a year** - an empty section is what it shows once the list runs out,
 * never a wrong date.
 */

export type Festival = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** One line of what a society usually does for it. */
  idea: string;
  emoji: string;
  /** Matched against event names to say "already planned". */
  match: RegExp;
};

export const FESTIVALS: Festival[] = [
  { name: "Dussehra", date: "2026-10-20", emoji: "🏹", idea: "Ravan dahan on the ground and a fair for the kids", match: /dussehra|dasara|vijaya/i },
  { name: "Karwa Chauth", date: "2026-10-29", emoji: "🌙", idea: "Mehendi, a moonrise gathering and dinner on the terrace", match: /karwa|karva/i },
  { name: "Diwali", date: "2026-11-08", emoji: "🪔", idea: "Diyas, a rangoli contest, fireworks and a mela", match: /diwali|deepavali/i },
  { name: "Chhath Puja", date: "2026-11-15", emoji: "🌅", idea: "A ghat, prasad and a team of volunteers", match: /chhath/i },
  { name: "Guru Nanak Jayanti", date: "2026-11-24", emoji: "🙏", idea: "Kirtan and langar in the clubhouse", match: /gurpurab|guru nanak/i },
  { name: "Christmas", date: "2026-12-25", emoji: "🎄", idea: "Carols, a tree lighting and Secret Santa", match: /christmas|xmas/i },
  { name: "New Year's Eve", date: "2026-12-31", emoji: "🎆", idea: "A DJ night, dinner and a countdown to midnight", match: /new year/i },
  { name: "Makar Sankranti", date: "2027-01-15", emoji: "🪁", idea: "Kite flying on the terrace and til-gul for everyone", match: /sankranti|pongal|lohri|uttarayan/i },
  { name: "Republic Day", date: "2027-01-26", emoji: "🇮🇳", idea: "Flag hoisting and a kids' parade", match: /republic/i },
  { name: "Vasant Panchami", date: "2027-02-11", emoji: "🌼", idea: "Saraswati puja for the children", match: /vasant|basant|saraswati/i },
  { name: "Maha Shivratri", date: "2027-03-06", emoji: "🔱", idea: "Night-long bhajans at the temple", match: /shivratri/i },
  { name: "Holi", date: "2027-03-22", emoji: "🎨", idea: "Organic colours, a rain dance and thandai", match: /holi/i },
];

export type FestivalIdea = {
  name: string;
  date: string;
  emoji: string;
  idea: string;
  days: number;
  /** The society's own event for it, when there is one. */
  planned: { id: string; name: string } | null;
};

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000;
};

/**
 * The next few festivals, nearest first, with the ones the society has already planned marked as such.
 * A festival under `minDays` away is left out (too late to organise one), and so is anything further than
 * `maxDays`, which is a different season's planning.
 */
export function upcomingFestivals(
  today: string,
  events: { id: string; name: string; startDate: string }[],
  { minDays = 3, maxDays = 75, limit = 4, list = FESTIVALS }: { minDays?: number; maxDays?: number; limit?: number; list?: Festival[] } = {},
): FestivalIdea[] {
  const now = dayNumber(today);
  return list
    .map((festival) => {
      const at = dayNumber(festival.date);
      const match = events.find((event) => festival.match.test(event.name) && Math.abs(dayNumber(event.startDate) - at) <= 12);
      return {
        name: festival.name,
        date: festival.date,
        emoji: festival.emoji,
        idea: festival.idea,
        days: Math.round(at - now),
        planned: match ? { id: match.id, name: match.name } : null,
      };
    })
    .filter((festival) => festival.days >= minDays && festival.days <= maxDays)
    .sort((a, b) => a.days - b.days)
    .slice(0, limit);
}
