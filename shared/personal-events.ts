/**
 * Personal events: a birthday, an anniversary, a get-together - private and invite-only, hosted by one
 * person, belonging to no society. Stored in `personal_events` and `personal_event_rsvps` (migration 049).
 *
 * Pure and import-free, shared by the API (which cleans everything on the way in) and the screens (which
 * draw from the same lists). Tested in tests/personal-events.test.mjs.
 *
 * ## The privacy rules, all enforced by the API
 *
 * - **Only somebody with the link or the code can see an event.** It is never listed anywhere else: not on
 *   a society page, not in search.
 * - **Guests see how many are coming, not who** - unless the host turns on "guests can see who's coming",
 *   and then names only.
 * - **A phone number is the host's alone.** It is never sent to anybody else, the guest who gave it included
 *   once it is saved (their own reply comes back without it).
 * - **No flat numbers.** A personal event never asks for one.
 * - Wishes are shown to everybody who can open the invitation, under the first name the guest typed.
 */

/** The screens draw each kind with a flat line icon keyed on `key` (src/components/shared/icon-tile.tsx). */
export const PERSONAL_KINDS = [
  { key: "birthday", name: "Birthday" },
  { key: "anniversary", name: "Anniversary" },
  { key: "get_together", name: "Get-together" },
  { key: "festival", name: "Festival" },
  { key: "wedding", name: "Wedding" },
  { key: "baby_shower", name: "Baby shower" },
  { key: "naming", name: "Naming ceremony" },
  { key: "other", name: "Something else" },
] as const;

export type PersonalKind = (typeof PERSONAL_KINDS)[number]["key"];

/** The event colours are the app's own five presets (src/lib/themes.ts); nothing else is accepted. */
export const PERSONAL_COLORS = ["teal", "marigold", "indigo", "rose", "forest"] as const;
export type PersonalColor = (typeof PERSONAL_COLORS)[number];

export type RsvpStatus = "going" | "maybe" | "declined";

export const LIMITS = {
  title: 100,
  description: 500,
  venue: 120,
  address: 200,
  name: 60,
  phone: 20,
  wish: 280,
  people: 20,
  /** Upcoming events one person may host at once. Keeps a spammer from making thousands of pages. */
  activePerHost: 20,
  /** Replies one event takes. A birthday is not a concert. */
  rsvpsPerEvent: 300,
} as const;

/** No I, L, O, 0 or 1: a code is read aloud and typed from a screenshot. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function newInviteCode(random: () => number = Math.random) {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/** "k7q 4mx" -> "K7Q4MX"; anything that cannot be a code -> null. */
export function normaliseCode(value: unknown) {
  const code = String(value ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function kindOf(key: unknown) {
  return PERSONAL_KINDS.find((kind) => kind.key === key) ?? PERSONAL_KINDS[PERSONAL_KINDS.length - 1];
}

export function isKind(value: unknown): value is PersonalKind {
  return PERSONAL_KINDS.some((kind) => kind.key === value);
}

export function isColor(value: unknown): value is PersonalColor {
  return (PERSONAL_COLORS as readonly string[]).includes(String(value));
}

/** Collapse whitespace and cut to `max`; empty becomes null. */
export function cleanText(value: unknown, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return text || null;
}

/** Like cleanText, but keeps line breaks (a description has paragraphs). */
export function cleanParagraphs(value: unknown, max: number) {
  const text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
  return text || null;
}

/** Digits, spaces and a leading +; anything else is not a phone number and is dropped. */
export function cleanPhone(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\+?[\d\s-]{6,20}$/.test(text)) return null;
  return text.replace(/\s+/g, " ").slice(0, LIMITS.phone);
}

export const isIsoDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export const isTime = (value: unknown) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** How many people a reply brings: a "no" brings nobody, and without plus-ones a "yes" is one person. */
export function peopleFor(status: RsvpStatus, people: unknown, allowPlusOnes: boolean) {
  if (status === "declined") return 0;
  if (!allowPlusOnes) return 1;
  const n = Math.round(Number(people));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, LIMITS.people);
}

export type RsvpCounts = {
  /** People coming, plus-ones included. */
  goingPeople: number;
  goingReplies: number;
  maybe: number;
  declined: number;
};

export function rsvpCounts(rows: { status: string; people: number | null }[]): RsvpCounts {
  const counts: RsvpCounts = { goingPeople: 0, goingReplies: 0, maybe: 0, declined: 0 };
  for (const row of rows) {
    if (row.status === "going") {
      counts.goingReplies += 1;
      counts.goingPeople += Math.max(1, Number(row.people) || 1);
    } else if (row.status === "maybe") counts.maybe += 1;
    else if (row.status === "declined") counts.declined += 1;
  }
  return counts;
}

/** "Priya Sharma" -> "Priya": what a wish is signed with on a page other guests can read. */
export function firstName(name: unknown) {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 30) || "A guest";
}

/** Replies close at the end of the event's day (IST calendar days, compared as strings). */
export function repliesOpen(startsOn: string, today: string, status: string) {
  return status === "active" && startsOn >= today;
}

/**
 * A code somebody typed, told apart by length: six characters from the invitation alphabet is a personal
 * event's invitation; eight letters and numbers is a society's invite code (api/_lib/societies.ts makes those).
 */
export function classifyCode(value: unknown): { kind: "invitation" | "society"; code: string } | null {
  const code = String(value ?? "").toUpperCase().replace(/[\s-]/g, "");
  const invitation = normaliseCode(code);
  if (invitation) return { kind: "invitation", code: invitation };
  if (/^[A-Z0-9]{8}$/.test(code)) return { kind: "society", code };
  return null;
}

/**
 * What somebody typed or pasted into "Join an event": a code, or a whole invitation link
 * (`https://…/i/K7Q4MX`, or a society's `…/join/AB12CD34`). Only this app's own path shapes are read out of a
 * link - nothing is fetched - so a pasted link from anywhere else is simply not a code.
 */
export function parseInviteInput(value: unknown): { kind: "invitation" | "society"; code: string } | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const link = /\/(i|join)\/([A-Za-z0-9-]{6,12})\/?(?:[?#].*)?$/.exec(text);
  if (link) {
    const found = classifyCode(link[2]);
    if (!found) return null;
    return (link[1] === "i") === (found.kind === "invitation") ? found : null;
  }
  if (/[/:.]/.test(text)) return null;
  return classifyCode(text);
}

/**
 * Each kind's accent: one of the five presets, so a category tile is tinted from the app's own palette and
 * never from a colour written into a component.
 */
export const KIND_ACCENT: Record<PersonalKind, PersonalColor> = {
  birthday: "rose",
  anniversary: "indigo",
  get_together: "forest",
  festival: "marigold",
  wedding: "rose",
  baby_shower: "teal",
  naming: "indigo",
  other: "teal",
};

export type MineEvent = { id: string; startsOn: string; status: string };
export type MineInvited = MineEvent & { myStatus: RsvpStatus | null };

/**
 * The four lists on My events, from the one `mine` read:
 * - Hosting: what you host that is still ahead (cancelled ones stay, marked, until their day passes);
 * - Invited: invitations still ahead that you have not said yes to - a "maybe" first, since it is the one
 *   still waiting on an answer;
 * - Joined: invitations still ahead that you said you're going to;
 * - Past: anything whose day has gone, newest first.
 */
export function myEventLists<H extends MineEvent, I extends MineInvited>(hosting: H[], invited: I[], today: string) {
  const ahead = <T extends MineEvent>(rows: T[]) => rows.filter((row) => row.startsOn >= today).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const rank = (status: RsvpStatus | null) => (status === "maybe" ? 0 : status === null ? 1 : 2);
  const upcomingInvites = ahead(invited);
  return {
    hosting: ahead(hosting),
    invited: upcomingInvites.filter((row) => row.myStatus !== "going").sort((a, b) => rank(a.myStatus) - rank(b.myStatus) || a.startsOn.localeCompare(b.startsOn)),
    joined: upcomingInvites.filter((row) => row.myStatus === "going"),
    past: [...hosting.map((row) => ({ row, hosted: true as const })), ...invited.map((row) => ({ row, hosted: false as const }))]
      .filter((item) => item.row.startsOn < today)
      .sort((a, b) => b.row.startsOn.localeCompare(a.row.startsOn)),
  };
}

/** Which list My events opens on: the first with something in it, in the order the tabs are drawn. */
export function firstFilledList(lists: { hosting: unknown[]; invited: unknown[]; joined: unknown[]; past: unknown[] }) {
  const order = ["hosting", "invited", "joined", "past"] as const;
  return order.find((key) => lists[key].length) ?? "hosting";
}
