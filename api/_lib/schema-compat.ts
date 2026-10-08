/**
 * Reading a table whose columns arrive with migrations, one column at a time.
 *
 * ## Why this exists
 *
 * `events` has been widened by five migrations (024, 026, 027, 029, 031), and
 * the user applies each by hand, so at any moment a database may sit anywhere
 * between them. The reads used to be written as "try the full column list; if
 * *anything* is missing, fall back to the original six columns". That is safe
 * for the page loading and wrong for everything else: one missing column
 * silently threw away every other column that did exist. A hero image that had
 * saved perfectly was never read back, only because an unrelated theme column
 * had not been created yet - and the page gave no sign of why.
 *
 * So instead: ask for everything, and when the database names a column that
 * does not exist, drop **that one** and ask again. The columns that exist keep
 * working however many of their neighbours do not.
 *
 * ## Rules
 *
 * - Only an "unknown column" error (Postgres `42703`, PostgREST `PGRST204`)
 *   is retried. Anything else - a dropped connection, a permissions error - is
 *   returned for the caller to throw, never papered over.
 * - **Core columns are never dropped.** If one of those is missing the schema
 *   is broken, not merely un-migrated, and pretending otherwise hides it.
 * - What was learned is remembered for a minute. A dashboard load would
 *   otherwise pay one failed query per missing column, every time, for as long
 *   as a migration stayed unapplied. A minute is short enough that running the
 *   migration is noticed without anyone restarting anything.
 */

type DbError = { code?: string; message?: string } | null;
type DbResult = { data: unknown; error: DbError };

const missingColumnCodes = ["42703", "PGRST204"];
const rememberMs = 60_000;

const remembered = new Map<string, { at: number; columns: Set<string> }>();

/** For tests, and for a code path that has just been told a migration ran. */
export function resetSchemaCompatCache() {
  remembered.clear();
}

export function isMissingColumnError(error: DbError) {
  return Boolean(error && missingColumnCodes.includes(error.code ?? ""));
}

/**
 * The column a "missing column" error is talking about, or null if the message
 * does not say. The two shapes:
 *
 *   Postgres   column events.hero_image_url does not exist
 *   Postgres   column "hero_image_url" of relation "events" does not exist
 *   PostgREST  Could not find the 'hero_image_url' column of 'events' in the schema cache
 */
export function missingColumnName(error: DbError): string | null {
  const message = error?.message ?? "";
  const postgres = message.match(/column\s+(?:"?\w+"?\.)?"?(\w+)"?\s+does not exist/i);
  if (postgres) return postgres[1];
  // An INSERT or UPDATE phrases it differently: column "x" of relation "events" does not exist
  const ofRelation = message.match(/column\s+"?(\w+)"?\s+of relation/i);
  if (ofRelation) return ofRelation[1];
  const postgrest = message.match(/Could not find the '(\w+)' column/i);
  if (postgrest) return postgrest[1];
  return null;
}

function knownMissing(table: string) {
  const entry = remembered.get(table);
  if (!entry) return new Set<string>();
  if (Date.now() - entry.at > rememberMs) {
    remembered.delete(table);
    return new Set<string>();
  }
  return entry.columns;
}

function remember(table: string, column: string) {
  const entry = remembered.get(table);
  if (entry && Date.now() - entry.at <= rememberMs) {
    entry.columns.add(column);
    return;
  }
  remembered.set(table, { at: Date.now(), columns: new Set([column]) });
}

/**
 * Run a select with `columns`, dropping any optional column the database says
 * it does not have.
 *
 * `run` receives the comma-joined column list and returns the query's result;
 * the caller owns the filters, so this works for `.eq(...)`, `.in(...)`, a
 * `.maybeSingle()` or a list alike. The result carries only the columns that
 * exist - absent keys are how a caller learns a column is not there, which is
 * why they read them with `"x" in row` rather than assuming.
 */
export async function selectDegrading(
  table: string,
  columns: string[],
  core: string[],
  run: (select: string) => PromiseLike<DbResult>,
): Promise<DbResult> {
  const coreSet = new Set(core);
  const skip = knownMissing(table);
  let active = columns.filter((column) => coreSet.has(column) || !skip.has(column));

  // One attempt per optional column is the most this can need.
  for (let attempt = 0; attempt <= columns.length; attempt += 1) {
    const result = await run(active.join(","));
    if (!result.error) return result;
    if (!isMissingColumnError(result.error)) return result;

    const named = missingColumnName(result.error);
    if (named && active.includes(named) && !coreSet.has(named)) {
      remember(table, named);
      active = active.filter((column) => column !== named);
      continue;
    }

    // The message did not name a column we asked for. Find out which of the
    // optional ones are missing by asking for each on its own; a core column
    // that is missing falls through and surfaces as the error it is.
    const survivors: string[] = [];
    for (const column of active) {
      if (coreSet.has(column)) {
        survivors.push(column);
        continue;
      }
      const probe = await run(column);
      if (probe.error && isMissingColumnError(probe.error)) {
        remember(table, column);
        continue;
      }
      if (probe.error) return probe;
      survivors.push(column);
    }
    active = survivors;
  }

  return run(active.join(","));
}

/**
 * The same idea for an insert: write the row, and if the database says an
 * optional column does not exist, write it again without that one.
 *
 * Event creation used to be "try everything, and on any missing column fall
 * back to the six columns that always existed", which silently threw away the
 * event's type and template along with whatever was actually missing. Now only
 * the missing column is lost.
 */
export async function insertDegrading(
  row: Record<string, unknown>,
  optional: string[],
  run: (row: Record<string, unknown>) => PromiseLike<DbResult>,
): Promise<DbResult> {
  const optionalSet = new Set(optional);
  let current = { ...row };

  for (let attempt = 0; attempt <= optional.length; attempt += 1) {
    const result = await run(current);
    if (!result.error || !isMissingColumnError(result.error)) return result;

    const named = missingColumnName(result.error);
    if (!named || !(named in current) || !optionalSet.has(named)) return result;

    const { [named]: _dropped, ...rest } = current;
    void _dropped;
    current = rest;
  }

  return run(current);
}
