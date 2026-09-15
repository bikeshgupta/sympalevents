/**
 * The **seed** for the closing page's credits - not the source of truth.
 *
 * The page builds most of its honour roll from real rows: the core committee
 * from `event_members`, volunteers from whoever owns a task or a slot on the
 * schedule, contributors and sponsors from their own tables, prasad sponsors
 * from `prasad_items`. Plenty of people did the work without ever being typed
 * into any of those, so an admin adds, removes and reorders names from the
 * page itself - stored per event on `event_closing`
 * ([020_closing_credits.sql](../../supabase/migrations/020_closing_credits.sql)).
 *
 * These lists stand in **only while nothing is stored** for an event -
 * before that migration is run, and afterwards until a committee opens the
 * editor. The editor preloads them, so the first save turns them into real,
 * per-event rows and this file stops mattering for that event. See
 * `withSeedCredits()` / `manualCredits()` in src/lib/closing.ts.
 *
 * Being a seed, it is **not per-event**: every event with empty stored
 * credits shows these names. That is the reason to save from the page rather
 * than add names here.
 */

/** Seeds the hand-added part of the "Core committee" list. */
export const extraCoreCommittee = ["Satish Singh", "Mohit Nagar", "Venkatesh Kakhandiki"];

/** Seeds the hand-added part of the "Volunteers" list. */
export const extraVolunteers = [
  "Prashant Chaudhary",
  "Priyanka Verma",
  "Sanjay Sahu",
  "Radhashyam",
  "Sourav Choudhary",
  "Rinkesh",
];

export type SpecialMention = {
  name: string;
  /** What they ran, in a couple of words. */
  role: string;
  /** One line saying what it actually took. */
  note: string;
};

/**
 * Seeds the shout-out line printed under the committee list: somebody who
 * carried a whole strand of the celebration and would otherwise be one name
 * among two hundred. Keep it to one or two - a page where everybody is
 * singled out singles nobody out.
 */
export const specialMentions: SpecialMention[] = [
  {
    name: "Ankita Nagar",
    role: "Cultural events",
    note: "Ran the cultural programme end to end - the line-up, the rehearsals, and the running order on the night.",
  },
];
