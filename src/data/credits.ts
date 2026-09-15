/**
 * Names the app cannot work out for itself, for the closing page's credits.
 *
 * A plain file, not a database table - the same arrangement as
 * src/data/announcements.ts. To credit somebody, add them here and deploy.
 *
 * The closing page builds most of its honour roll from real rows: core
 * committee from `event_members`, volunteers from whoever owns a task or a
 * slot on the schedule, contributors and sponsors from their own tables,
 * prasad sponsors from `prasad_items`. These are the people who did the work
 * without ever being typed into any of those - so they are listed by hand
 * rather than left off.
 *
 * Merged in by `mergeCredits()` in src/lib/closing.ts, which drops a name
 * that the data already carries (matched case-insensitively), so somebody
 * added here later does not appear twice once they turn up in a real row.
 *
 * Note this is **not per-event**: every event in the app shows these names,
 * the same way every event shows the same announcements.
 */

/** Added to the "Core committee" group. */
export const extraCoreCommittee = ["Satish Singh", "Mohit Nagar", "Venkatesh Kakhandiki"];

/** Added to the "Volunteers" group. */
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
  /** What they ran, in a couple of words - this is the headline of the card. */
  role: string;
  /** One sentence saying what it actually took. */
  note: string;
};

/**
 * The shout-out block above the credits: somebody who carried a whole strand
 * of the celebration on their own and would otherwise be one chip in a list
 * of two hundred. Keep it to one or two - a page where everybody is singled
 * out singles nobody out.
 */
export const specialMentions: SpecialMention[] = [
  {
    name: "Ankita Nagar",
    role: "Cultural events",
    note: "Put the whole cultural programme together - the line-up, the rehearsals, the running order on the night, and every performer chased, reassured and got on stage on time.",
  },
];
