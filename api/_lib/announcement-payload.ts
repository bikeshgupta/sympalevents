/**
 * What is particular to a poll or an ask-me-anything, and the rules around it.
 *
 * Pure and import-free, so it is checked directly (tests/polls-and-questions.test.mjs)
 * and shared by the writes (announcements.ts), the reads and the voting
 * (announcement-interactions.ts). The same shape is read on the client in
 * src/lib/announcement-interactions.ts.
 *
 * The payload is jsonb, which stores anything. Every read cleans it again, so a
 * row edited by hand cannot put sixty options or a script tag in front of
 * every visitor.
 */

export type ResultsRule = "always" | "after_vote" | "after_close";

export type PollOption = { id: string; label: string };

export type PollPayload = {
  options: PollOption[];
  showResults: ResultsRule;
  closesAt: string | null;
};

export type AskPayload = { closesAt: string | null };

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_OPTION_LABEL = 80;

const resultsRules = new Set<string>(["always", "after_vote", "after_close"]);

function fail(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

/** An ISO timestamp, or null. Anything unparseable is a mistake worth saying so. */
export function cleanClosesAt(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) fail("The closing time is not valid");
  return date.toISOString();
}

/**
 * Options keep the id they arrived with, so a vote already cast keeps pointing
 * at the same choice when somebody corrects a typo; a new one gets the next
 * free `o<n>`. Blank labels are dropped, repeats are refused.
 */
export function cleanPollPayload(raw: unknown): PollPayload {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const incoming = Array.isArray(source.options) ? source.options : [];

  const used = new Set<string>();
  const labels = new Set<string>();
  const options: PollOption[] = [];

  for (const entry of incoming) {
    const item = (entry && typeof entry === "object" ? entry : { label: entry }) as Record<string, unknown>;
    const label = String(item.label ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_OPTION_LABEL);
    if (!label) continue;
    if (labels.has(label.toLowerCase())) fail("Two options say the same thing");
    labels.add(label.toLowerCase());

    const given = String(item.id ?? "").trim();
    if (/^o\d{1,2}$/.test(given) && !used.has(given)) {
      used.add(given);
      options.push({ id: given, label });
    } else {
      options.push({ id: "", label });
    }
  }

  let next = 1;
  for (const option of options) {
    if (option.id) continue;
    while (used.has(`o${next}`)) next += 1;
    option.id = `o${next}`;
    used.add(option.id);
  }

  if (options.length < MIN_OPTIONS) fail(`A poll needs at least ${MIN_OPTIONS} options`);
  if (options.length > MAX_OPTIONS) fail(`A poll can have at most ${MAX_OPTIONS} options`);

  const rule = String(source.showResults ?? "after_vote");
  return {
    options,
    showResults: resultsRules.has(rule) ? (rule as ResultsRule) : "after_vote",
    closesAt: cleanClosesAt(source.closesAt),
  };
}

export function cleanAskPayload(raw: unknown): AskPayload {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { closesAt: cleanClosesAt(source.closesAt) };
}

/** Whatever is stored for a kind, made safe to send. A message has nothing. */
export function readPayload(kind: string, raw: unknown): Record<string, unknown> {
  try {
    if (kind === "poll") return cleanPollPayload(raw) as unknown as Record<string, unknown>;
    if (kind === "ask") return cleanAskPayload(raw) as unknown as Record<string, unknown>;
  } catch {
    // A stored poll that no longer validates (hand-edited, say) is shown as
    // having no options rather than failing the whole dashboard.
    if (kind === "poll") return { options: [], showResults: "after_vote", closesAt: null };
    if (kind === "ask") return { closesAt: null };
  }
  return {};
}

export function isClosed(payload: { closesAt?: string | null }, now = new Date()) {
  return Boolean(payload.closesAt && now.getTime() >= new Date(payload.closesAt).getTime());
}

/**
 * Whether this person may see the counts.
 *
 * Organisers always can: they cannot run a poll blind. Everyone else follows
 * the rule the organiser chose - and the server enforces it, because a result
 * hidden only by the page would still be in the response.
 */
export function canSeeResults(rule: ResultsRule, who: { isEditor: boolean; hasVoted: boolean; closed: boolean }) {
  if (who.isEditor) return true;
  if (rule === "always") return true;
  if (rule === "after_close") return who.closed;
  return who.hasVoted || who.closed;
}

export type Tally = { options: { id: string; label: string; votes: number }[]; total: number };

/** Counts per option from the raw option ids of every vote. An id that is no
 *  longer an option (an option removed before anybody voted) counts for nothing. */
export function tally(options: PollOption[], votedFor: string[]): Tally {
  const counts = new Map(options.map((option) => [option.id, 0]));
  for (const id of votedFor) if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const rows = options.map((option) => ({ ...option, votes: counts.get(option.id) ?? 0 }));
  return { options: rows, total: rows.reduce((sum, row) => sum + row.votes, 0) };
}

/** True when two option lists are the same choices - ids and wording. */
export function sameOptions(a: PollOption[], b: PollOption[]) {
  return a.length === b.length && a.every((option, index) => option.id === b[index].id && option.label === b[index].label);
}

export const MAX_PENDING_PER_PERSON = 3;
export const MIN_QUESTION = 3;
export const MAX_QUESTION = 300;
export const MAX_ANSWER = 1500;
