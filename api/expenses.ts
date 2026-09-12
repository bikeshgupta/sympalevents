import { randomUUID } from "node:crypto";
import { fetchPageVisibility } from "./_lib/page-visibility.js";
import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  sendJson,
} from "./_lib/server.js";

/**
 * The expense ledger and out-of-pocket claims - one function, because this
 * project sits at the Vercel function cap (see CLAUDE.md):
 *
 *   GET    /api/expenses?eventId=   the ledger (or only the caller's own claims) + access
 *   POST   /api/expenses            record an expense, optionally with a bill
 *   PATCH  /api/expenses            edit it; or { id, action: "settle" | "unsettle" }
 *   DELETE /api/expenses            remove it, and its bill
 *
 * The flow it exists for: a committee member pays from their own pocket,
 * records it here, and the admin pays them back and marks it settled.
 *
 * Every rule below is enforced here; the page only mirrors them to decide
 * which controls to draw.
 *
 *   view the ledger   admin, page visibility public/authenticated, or a view/edit grant
 *   record a claim    any committee member (role admin or committee), or an edit grant
 *   manage            admin, or an edit grant - edit any row, settle, delete
 *   settle            manage, except that a non-admin cannot settle their *own* claim
 *   your own claim    whoever recorded it may edit or withdraw it until it is settled
 *   see a bill        committee, a view/edit grant, or the claim's own recorder -
 *                     never anonymous, even when the admin has made the page public
 */

type ReimbursementStatus = "pending" | "settled" | "not_needed";

type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers: {
    authorization?: string;
  };
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

const MIGRATION = "supabase/migrations/018_expense_claims.sql";
const BILL_BUCKET = "expense-bills";
// Base64 inflates a file by ~1/3 inside the JSON body, and Vercel caps a
// request at 4.5MB, so 3MB is the most a bill can be and still arrive. Photos
// never get near it: the page shrinks them on the phone before sending.
const BILL_MAX_BYTES = 3 * 1024 * 1024;
const BILL_LINK_SECONDS = 60 * 60;
// A typo guard, not a policy: nothing a society festival pays for in one go
// costs more than a crore.
const MAX_AMOUNT = 10_000_000;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepted bill formats, each checked by its leading bytes as well as its
 *  declared type - a renamed file is refused rather than stored. */
const billTypes: Record<string, { ext: string; looksLike: (bytes: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", looksLike: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": {
    ext: "png",
    looksLike: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  "image/webp": {
    ext: "webp",
    looksLike: (bytes) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
  },
  "application/pdf": { ext: "pdf", looksLike: (bytes) => bytes.toString("ascii", 0, 5) === "%PDF-" },
};

// `app_users` is embedded twice, so each embed names its foreign key - with
// two FKs to one table a bare `app_users(...)` makes PostgREST answer
// PGRST201 instead of picking one. The names are set in migration 018.
const claimColumns =
  "id,event_id,expense_date,category,item,amount,paid_by,notes,created_at," +
  "submitted_by,reimbursement_status,settled_at,settled_by,bill_path," +
  "submitter:app_users!expenses_submitted_by_fkey(full_name,email)," +
  "settler:app_users!expenses_settled_by_fkey(full_name,email)";
const legacyColumns = "id,event_id,expense_date,category,item,amount,paid_by,notes,created_at";

function fail(message: string, statusCode = 400) {
  const error = new Error(message);
  Object.assign(error, { statusCode });
  return error;
}

/** Migration 018 has not been run: the claim columns or their FKs are missing. */
function isMissingClaims(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (["42703", "PGRST204", "PGRST200"].includes(error.code ?? "")) return true;
  const message = error.message ?? "";
  return (
    /does not exist|could not find/i.test(message) &&
    /submitted_by|reimbursement_status|settled_at|settled_by|bill_path|expenses_\w+_fkey/.test(message)
  );
}

function claimsMissing() {
  return fail(`Expense claims are not switched on yet. Run ${MIGRATION} in Supabase, then try again.`, 501);
}

type ExpenseAccess = {
  isAdmin: boolean;
  canViewLedger: boolean;
  canSubmit: boolean;
  canManage: boolean;
  canSeeBills: boolean;
};

async function resolveExpenseAccess(eventId: string, userId: string | null): Promise<ExpenseAccess> {
  const supabase = assertServiceSupabase();

  if (!userId) {
    const visibility = (await fetchPageVisibility(eventId)).expenses;
    return {
      isAdmin: false,
      canViewLedger: visibility === "public",
      canSubmit: false,
      canManage: false,
      canSeeBills: false,
    };
  }

  const [{ data: member, error: memberError }, { data: permission, error: permissionError }, visibilityMap] =
    await Promise.all([
      supabase.from("event_members").select("role").eq("event_id", eventId).eq("user_id", userId).maybeSingle(),
      supabase
        .from("event_page_permissions")
        .select("access_level")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .eq("page_key", "expenses")
        .maybeSingle(),
      fetchPageVisibility(eventId),
    ]);

  if (memberError) throw memberError;
  if (permissionError) throw permissionError;

  const role = member?.role ?? null;
  const accessLevel = permission?.access_level ?? "none";
  const visibility = visibilityMap.expenses;
  const isAdmin = role === "admin";
  const isCommittee = isAdmin || role === "committee";
  const granted = accessLevel === "view" || accessLevel === "edit";

  return {
    isAdmin,
    canViewLedger: isAdmin || visibility === "public" || visibility === "authenticated" || granted,
    canSubmit: isCommittee || accessLevel === "edit",
    canManage: isAdmin || accessLevel === "edit",
    canSeeBills: isCommittee || granted,
  };
}

async function optionalAppUser(req: ApiRequest) {
  const header = String(req.headers.authorization ?? "");
  if (!header.startsWith("Bearer ")) return null;
  const { appUser } = await requireAppUser(req);
  return appUser;
}

type ExpenseRecord = Record<string, unknown>;

type StatusFilterable<T> = {
  eq: (column: string, value: string) => T;
  is: (column: string, value: null) => T;
};

/** Narrows a write to rows still at the status they were read with. */
function whereStatus<T extends StatusFilterable<T>>(query: T, status: ReimbursementStatus | null): T {
  return status === null ? query.is("reimbursement_status", null) : query.eq("reimbursement_status", status);
}

async function fetchExpenseRows(eventId: string, onlySubmittedBy: string | null) {
  const supabase = assertServiceSupabase();

  let rich = supabase.from("expenses").select(claimColumns).eq("event_id", eventId);
  if (onlySubmittedBy) rich = rich.eq("submitted_by", onlySubmittedBy);
  const richResult = await rich
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!isMissingClaims(richResult.error)) {
    if (richResult.error) throw richResult.error;
    // A select built from a concatenated string is untyped to postgrest-js.
    return { rows: (richResult.data ?? []) as unknown as ExpenseRecord[], claimsReady: true };
  }

  // Migration 018 has not been run. The ledger itself is still worth showing,
  // so reads degrade to the old columns and the page says so, naming the
  // migration - the same "read degrades, write says so" shape as Tasks.
  console.warn("expenses claim columns are missing. Run migration 018_expense_claims.sql.");
  // There is nothing to find someone's own claims by before the migration.
  if (onlySubmittedBy) return { rows: [] as ExpenseRecord[], claimsReady: false };

  const plain = await supabase
    .from("expenses")
    .select(legacyColumns)
    .eq("event_id", eventId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (plain.error) throw plain.error;
  return { rows: (plain.data ?? []) as ExpenseRecord[], claimsReady: false };
}

/** One-hour links for the bills this caller may see. A missing bucket or a
 *  signing failure costs the links, never the ledger. */
async function signBillLinks(paths: string[]) {
  const links = new Map<string, string>();
  if (!paths.length) return links;

  const supabase = assertServiceSupabase();
  const { data, error } = await supabase.storage.from(BILL_BUCKET).createSignedUrls(paths, BILL_LINK_SECONDS);
  if (error) {
    console.warn("Could not sign expense bill links:", error.message);
    return links;
  }

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) links.set(entry.path, entry.signedUrl);
  }
  return links;
}

function personName(value: unknown) {
  const person = (Array.isArray(value) ? value[0] : value) as { full_name?: string | null; email?: string } | null;
  return person ? person.full_name || person.email || null : null;
}

function shapeExpense(row: ExpenseRecord, userId: string | null, links: Map<string, string>) {
  const billPath = (row.bill_path as string | null) ?? null;

  return {
    id: row.id as string,
    date: (row.expense_date as string) ?? "",
    category: (row.category as string) ?? "",
    item: (row.item as string) ?? "",
    amount: Number(row.amount ?? 0),
    paidBy: (row.paid_by as string) ?? "",
    notes: (row.notes as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
    status: ((row.reimbursement_status as ReimbursementStatus | null) ?? null),
    settledAt: (row.settled_at as string | null) ?? null,
    // Names only, and only to a signed-in viewer - the page may be public.
    settledByName: userId ? personName(row.settler) : null,
    submittedByName: userId ? personName(row.submitter) : null,
    mine: Boolean(userId && row.submitted_by === userId),
    hasBill: Boolean(billPath),
    billUrl: billPath ? links.get(billPath) ?? null : null,
    billIsPdf: Boolean(billPath?.endsWith(".pdf")),
  };
}

function readExpenseFields(body: Record<string, unknown>) {
  const item = String(body.item ?? "").trim();
  const category = String(body.category ?? "").trim();
  const date = String(body.date ?? "").trim();
  const amount = Number(body.amount);
  const paidBy = String(body.paidBy ?? "").trim();
  const notes = String(body.notes ?? "").trim();

  if (!item) throw fail("Say what the money was spent on.");
  if (item.length > 200) throw fail("Keep the item under 200 characters.");
  if (!category) throw fail("Pick a category.");
  if (category.length > 60) throw fail("Keep the category under 60 characters.");

  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  // The round trip catches dates that parse but do not exist, like 30 February.
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw fail("Pick the date it was paid.");
  }

  if (!Number.isFinite(amount) || amount <= 0) throw fail("The amount must be more than zero.");
  if (amount > MAX_AMOUNT) throw fail("That amount looks too large - check it and try again.");
  if (paidBy.length > 100) throw fail("Keep the name under 100 characters.");
  if (notes.length > 1000) throw fail("Keep the note under 1000 characters.");

  return {
    item,
    category,
    expense_date: date,
    amount: Math.round(amount * 100) / 100,
    paid_by: paidBy,
    notes,
    updated_at: new Date().toISOString(),
  };
}

/** Stores a bill in the private bucket and returns its path (never a URL). */
async function storeBill(eventId: string, dataUrl: unknown) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(dataUrl ?? ""));
  if (!match) throw fail("The bill could not be read. Choose the file again.");

  const mimeType = match[1];
  const kind = billTypes[mimeType];
  if (!kind) throw fail("A bill has to be a photo (JPEG, PNG or WEBP) or a PDF.");

  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) throw fail("The bill file is empty.");
  if (bytes.length > BILL_MAX_BYTES) {
    throw fail("That bill is larger than 3MB. Attach a photo of it instead, or a smaller PDF.");
  }
  if (!kind.looksLike(bytes)) throw fail("That file is not a real photo or PDF. Choose the bill again.");

  const path = `${eventId}/${randomUUID()}.${kind.ext}`;
  const supabase = assertServiceSupabase();
  const { error } = await supabase.storage.from(BILL_BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw fail(`Bills cannot be stored yet: the expense-bills bucket is missing. Run ${MIGRATION} in Supabase, then try again.`, 501);
    }
    throw error;
  }

  return path;
}

/** Best effort: a file left behind costs a little storage, never a wrong ledger. */
async function discardBill(path: string) {
  const supabase = assertServiceSupabase();
  const { error } = await supabase.storage.from(BILL_BUCKET).remove([path]);
  if (error) console.warn(`Could not remove expense bill ${path}:`, error.message);
}

type ExistingExpense = {
  id: string;
  event_id: string;
  submitted_by: string | null;
  reimbursement_status: ReimbursementStatus | null;
  bill_path: string | null;
  claimsReady: boolean;
};

async function loadExpense(expenseId: string): Promise<ExistingExpense> {
  const supabase = assertServiceSupabase();
  const rich = await supabase
    .from("expenses")
    .select("id,event_id,submitted_by,reimbursement_status,bill_path")
    .eq("id", expenseId)
    .maybeSingle();

  if (!isMissingClaims(rich.error)) {
    if (rich.error) throw rich.error;
    if (!rich.data) throw fail("That expense no longer exists. Refresh the page.", 404);
    return { ...(rich.data as Omit<ExistingExpense, "claimsReady">), claimsReady: true };
  }

  const plain = await supabase.from("expenses").select("id,event_id").eq("id", expenseId).maybeSingle();
  if (plain.error) throw plain.error;
  if (!plain.data) throw fail("That expense no longer exists. Refresh the page.", 404);
  return {
    id: plain.data.id,
    event_id: plain.data.event_id,
    submitted_by: null,
    reimbursement_status: null,
    bill_path: null,
    claimsReady: false,
  };
}

async function listExpenses(req: ApiRequest, res: ApiResponse) {
  const eventId = String(req.query?.eventId ?? "");
  if (!uuidPattern.test(eventId)) {
    sendJson(res, 400, { error: "eventId is required" });
    return;
  }

  const appUser = await optionalAppUser(req);
  const userId = appUser?.id ?? null;
  const access = await resolveExpenseAccess(eventId, userId);

  if (!access.canViewLedger && !access.canSubmit) {
    throw userId
      ? fail("You do not have access to this event's expenses.", 403)
      : fail("Sign in to see this event's expenses.", 401);
  }

  // Without view access to the ledger, a committee member still gets the one
  // thing that is theirs: the claims they recorded.
  const onlyMine = !access.canViewLedger;
  const { rows, claimsReady } = await fetchExpenseRows(eventId, onlyMine ? userId : null);

  const billPaths = rows
    .filter((row) => row.bill_path && (access.canSeeBills || (userId && row.submitted_by === userId)))
    .map((row) => row.bill_path as string);
  const links = await signBillLinks(billPaths);

  sendJson(res, 200, {
    expenses: rows.map((row) => shapeExpense(row, userId, links)),
    claimsReady,
    scope: onlyMine ? "mine" : "all",
    me: appUser ? { id: appUser.id, name: appUser.full_name || appUser.email } : null,
    access: {
      canViewLedger: access.canViewLedger,
      canSubmit: access.canSubmit,
      canManage: access.canManage,
      isAdmin: access.isAdmin,
    },
  });
}

async function createExpense(userId: string, body: Record<string, unknown>, res: ApiResponse) {
  const eventId = String(body.eventId ?? "");
  if (!uuidPattern.test(eventId)) {
    sendJson(res, 400, { error: "eventId is required" });
    return;
  }

  const access = await resolveExpenseAccess(eventId, userId);
  if (!access.canSubmit) throw fail("Only committee members can record an expense on this event.", 403);

  const fields = readExpenseFields(body);
  const fromFunds = body.paidFrom === "funds";
  if (fromFunds) fields.paid_by = "";
  else if (!fields.paid_by) throw fail("Say who paid, so the right person is paid back.");

  const billPath = body.bill ? await storeBill(eventId, body.bill) : null;

  const supabase = assertServiceSupabase();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      event_id: eventId,
      ...fields,
      submitted_by: userId,
      reimbursement_status: fromFunds ? "not_needed" : "pending",
      bill_path: billPath,
    })
    .select("id")
    .single();

  if (error) {
    if (billPath) await discardBill(billPath);
    if (isMissingClaims(error)) throw claimsMissing();
    throw error;
  }

  sendJson(res, 201, { expenseId: data.id });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const method = String(req.method);
    if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    if (method === "GET") {
      await listExpenses(req, res);
      return;
    }

    const { appUser } = await requireAppUser(req);
    const body = (await getRequestBody(req)) as Record<string, unknown>;

    if (method === "POST") {
      await createExpense(appUser.id, body, res);
      return;
    }

    const expenseId = String(body.id ?? "");
    if (!uuidPattern.test(expenseId)) {
      sendJson(res, 400, { error: "id is required" });
      return;
    }

    const existing = await loadExpense(expenseId);
    const access = await resolveExpenseAccess(existing.event_id, appUser.id);
    const mine = existing.submitted_by === appUser.id;
    // Your own claim is yours to fix or withdraw until someone settles it.
    const ownUnsettled = mine && access.canSubmit && existing.reimbursement_status !== "settled";
    const supabase = assertServiceSupabase();
    const now = new Date().toISOString();

    // Every write below is conditional on the status it was read with, so a
    // settle that lands between our read and our write is never overwritten -
    // the loser gets a 409 and a fresh look instead.
    const readStatus = existing.reimbursement_status;
    const changedUnderneath = () =>
      fail("Someone changed this expense a moment ago. Refresh and check it before trying again.", 409);

    if (method === "DELETE") {
      if (!access.canManage && !ownUnsettled) {
        throw fail(
          mine
            ? "This claim has been settled, so only the admin or a member with edit access to Expenses can remove it."
            : "Only an event admin, or a member with edit access to Expenses, can delete this.",
          403,
        );
      }

      let query = supabase.from("expenses").delete().eq("id", expenseId);
      if (existing.claimsReady) query = whereStatus(query, readStatus);
      const { data, error } = await query.select("id");
      if (error) throw error;
      if (!data?.length) throw changedUnderneath();

      if (existing.bill_path) await discardBill(existing.bill_path);
      sendJson(res, 200, { ok: true });
      return;
    }

    // PATCH. Everything from here on reads or writes the claim columns.
    if (!existing.claimsReady) throw claimsMissing();

    const action = String(body.action ?? "");

    if (action === "settle" || action === "unsettle") {
      if (!access.canManage) {
        throw fail("Only an event admin, or a member with edit access to Expenses, can change whether a claim is settled.", 403);
      }

      if (action === "settle") {
        if (existing.reimbursement_status !== "pending") {
          throw fail("Only a claim that is waiting to be paid back can be marked settled.", 409);
        }
        // Nobody signs off their own reimbursement - except the admin, who is
        // the one paying everybody back and has no one above them to ask.
        if (mine && !access.isAdmin) {
          throw fail("You cannot settle your own claim. Ask the admin to mark it once they have paid you back.", 403);
        }
      } else if (existing.reimbursement_status !== "settled") {
        throw fail("This claim is not marked settled.", 409);
      }

      const update =
        action === "settle"
          ? { reimbursement_status: "settled", settled_at: now, settled_by: appUser.id, updated_at: now }
          : { reimbursement_status: "pending", settled_at: null, settled_by: null, updated_at: now };

      const { data, error } = await whereStatus(
        supabase.from("expenses").update(update).eq("id", expenseId),
        readStatus,
      ).select("id");
      if (error) throw error;
      if (!data?.length) throw changedUnderneath();

      sendJson(res, 200, { ok: true });
      return;
    }

    if (action) {
      sendJson(res, 400, { error: "Unknown action" });
      return;
    }

    // A full edit.
    if (!access.canManage && !ownUnsettled) {
      throw fail(
        mine
          ? "This claim has been settled, so only the admin or a member with edit access to Expenses can change it."
          : "Only an event admin, or a member with edit access to Expenses, can edit this.",
        403,
      );
    }

    const fields = readExpenseFields(body);

    // Who paid decides the status - except on a settled claim, which stays
    // settled until someone deliberately unsettles it, and on an entry from
    // before claims existed, which stays untracked unless the editor picks.
    let status = existing.reimbursement_status;
    if (status !== "settled") {
      if (body.paidFrom === "funds") status = "not_needed";
      else if (body.paidFrom === "pocket") status = "pending";
    }
    if (status === "not_needed") fields.paid_by = "";
    if (status === "pending" && !fields.paid_by) throw fail("Say who paid, so the right person is paid back.");

    const removeBill = body.removeBill === true;
    const newBillPath = body.bill ? await storeBill(existing.event_id, body.bill) : null;
    const update: Record<string, unknown> = { ...fields, reimbursement_status: status };
    if (newBillPath) update.bill_path = newBillPath;
    else if (removeBill) update.bill_path = null;

    const { data, error } = await whereStatus(
      supabase.from("expenses").update(update).eq("id", expenseId),
      readStatus,
    ).select("id");
    if (error || !data?.length) {
      if (newBillPath) await discardBill(newBillPath);
      if (error) throw error;
      throw changedUnderneath();
    }

    if ((newBillPath || removeBill) && existing.bill_path) await discardBill(existing.bill_path);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleApiError(res, error);
  }
}
