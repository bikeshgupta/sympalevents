import { randomUUID } from "node:crypto";
import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  requireEventCommittee,
  sendJson,
} from "./server.js";

type ApiRequest = {
  method?: string;
  query?: {
    eventId?: string | string[];
    status?: string | string[];
  };
  headers: {
    authorization?: string;
  };
  body?: unknown;
};

type ApiResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

const PAYMENT_FIELDS =
  "id,event_id,contribution_id,resident_id,flat_no,resident_name,resident_type,phone,amount,note," +
  "reference,payer_reference,upi_vpa,status,reviewed_at,review_note,created_at,updated_at";

/** The row shape `applyConfirmedPayment` needs - what the payer told us. */
type PaymentRow = {
  event_id: string;
  resident_id: string | null;
  flat_no: string;
  resident_name: string;
  resident_type: string | null;
  phone: string | null;
  reference: string;
  payer_reference: string | null;
};

/** Statuses a committee member still has to make a decision about. */
const OPEN_STATUSES = ["initiated", "awaiting_confirmation"];

/** A community collection, not a payment gateway - anything above this is a typo. */
const MAX_AMOUNT = 1_000_000;

/**
 * The `tr` field of a UPI link is limited and alphanumeric-ish in practice, so
 * this stays short and safe: a fixed prefix, the date, and enough randomness
 * that it is not guessable. The payer sees it in their UPI app and the
 * committee sees it on the bank statement - that is how a claim gets matched
 * to a real transfer, and it is also the payer's capability token for the
 * status updates below.
 */
function buildReference() {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const random = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `SPE${date}${random}`;
}

/** Today in the event's timezone - a payment made at 1am IST belongs to that day. */
function todayInEventZone() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function trimmed(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

/**
 * Contributing does not require an account - a resident with the dashboard
 * link can pay. We still record who they were when a token happens to be
 * present, so the committee can see a signed-in name against the claim.
 */
async function optionalAppUser(req: ApiRequest) {
  if (!String(req.headers.authorization ?? "")) return null;
  try {
    const { appUser } = await requireAppUser(req);
    return appUser;
  } catch {
    return null;
  }
}

/**
 * Self-service UPI contributions.
 *
 * Served from `/api/events?resource=contribution-payments` rather than its own
 * file: Vercel turns every file directly under `api/` into a serverless
 * function and this project is already at the plan's cap (see CLAUDE.md), so a
 * new route here would break the deploy. Dispatch reads only the query string.
 */
export async function handleContributionPayments(req: ApiRequest, res: ApiResponse) {
  try {
    const supabase = assertServiceSupabase();

    // The review queue - committee only, because these rows carry residents'
    // names and phone numbers.
    if (req.method === "GET") {
      const eventId = String(req.query?.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      const { appUser } = await requireAppUser(req);
      await requireEventCommittee(eventId, appUser.id);

      const scope = String(req.query?.status ?? "open");
      let query = supabase
        .from("contribution_payments")
        .select(PAYMENT_FIELDS)
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      if (scope === "open") query = query.in("status", OPEN_STATUSES);

      const { data, error } = await query.limit(200);
      if (error) throw error;

      sendJson(res, 200, { payments: (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) })) });
      return;
    }

    // Starting a payment. Open on purpose: the dashboard is a public page and
    // a resident should not need an account to contribute. Nothing here moves
    // money or touches `contributions` - it only records an intent that a
    // committee member has to confirm.
    if (req.method === "POST") {
      const body = (await getRequestBody(req)) as Record<string, unknown>;
      const eventId = trimmed(body.eventId, 64);
      const flatNo = trimmed(body.flat, 40);
      const residentName = trimmed(body.name, 120);
      const residentType = trimmed(body.type, 20) || null;
      const phone = trimmed(body.phone, 20);
      const note = trimmed(body.note, 200) || null;
      const upiVpa = trimmed(body.upiVpa, 120) || null;
      const amount = Number(body.amount);

      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }
      if (!flatNo) {
        sendJson(res, 400, { error: "Flat number is required" });
        return;
      }
      if (!residentName) {
        sendJson(res, 400, { error: "Name is required" });
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { error: "Enter a valid amount" });
        return;
      }
      if (amount > MAX_AMOUNT) {
        sendJson(res, 400, { error: "That amount looks too large. Please check it and try again." });
        return;
      }

      const appUser = await optionalAppUser(req);

      const { data, error } = await supabase
        .from("contribution_payments")
        .insert({
          event_id: eventId,
          flat_no: flatNo,
          resident_name: residentName,
          resident_type: residentType,
          phone: phone || null,
          amount,
          note,
          upi_vpa: upiVpa,
          reference: buildReference(),
          app_user_id: appUser?.id ?? null,
          status: "initiated",
        })
        .select(PAYMENT_FIELDS)
        .single();

      if (error) throw error;
      sendJson(res, 201, { payment: { ...data, amount: Number(data.amount) } });
      return;
    }

    if (req.method === "PATCH") {
      const body = (await getRequestBody(req)) as Record<string, unknown>;
      const action = trimmed(body.action, 20);
      const paymentId = trimmed(body.paymentId, 64);

      if (!paymentId) {
        sendJson(res, 400, { error: "paymentId is required" });
        return;
      }

      // Payer side. Authorized by the reference we generated and handed back
      // only to whoever started this payment - no account needed, but also not
      // something a stranger can close out for somebody else.
      if (action === "reported" || action === "cancelled") {
        const reference = trimmed(body.reference, 64);
        if (!reference) {
          sendJson(res, 400, { error: "reference is required" });
          return;
        }

        const { data: existing, error: loadError } = await supabase
          .from("contribution_payments")
          .select("id,status")
          .eq("id", paymentId)
          .eq("reference", reference)
          .maybeSingle();

        if (loadError) throw loadError;
        if (!existing) {
          sendJson(res, 404, { error: "Payment not found" });
          return;
        }
        // A confirmed or rejected payment has already been reviewed; the payer
        // cannot walk it back from here.
        if (!OPEN_STATUSES.includes(existing.status)) {
          sendJson(res, 409, { error: "This payment has already been reviewed by the committee" });
          return;
        }

        const { data, error } = await supabase
          .from("contribution_payments")
          .update({
            status: action === "reported" ? "awaiting_confirmation" : "cancelled",
            payer_reference: action === "reported" ? trimmed(body.payerReference, 60) || null : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentId)
          .select(PAYMENT_FIELDS)
          .single();

        if (error) throw error;
        sendJson(res, 200, { payment: { ...data, amount: Number(data.amount) } });
        return;
      }

      // Committee side.
      if (action !== "confirm" && action !== "reject") {
        sendJson(res, 400, { error: "Unknown action" });
        return;
      }

      const { appUser } = await requireAppUser(req);

      const { data: payment, error: paymentError } = await supabase
        .from("contribution_payments")
        .select(PAYMENT_FIELDS)
        .eq("id", paymentId)
        .maybeSingle();

      if (paymentError) throw paymentError;
      if (!payment) {
        sendJson(res, 404, { error: "Payment not found" });
        return;
      }

      await requireEventCommittee(payment.event_id, appUser.id);

      if (!OPEN_STATUSES.includes(payment.status)) {
        sendJson(res, 409, { error: "This payment has already been reviewed" });
        return;
      }

      const reviewNote = trimmed(body.reviewNote, 200) || null;
      const now = new Date().toISOString();

      if (action === "reject") {
        const { data, error } = await supabase
          .from("contribution_payments")
          .update({
            status: "rejected",
            reviewed_by: appUser.id,
            reviewed_at: now,
            review_note: reviewNote,
            updated_at: now,
          })
          .eq("id", paymentId)
          .select(PAYMENT_FIELDS)
          .single();

        if (error) throw error;
        sendJson(res, 200, { payment: { ...data, amount: Number(data.amount) } });
        return;
      }

      const amount = Number(payment.amount);
      const result = await applyConfirmedPayment(supabase, payment as PaymentRow, amount);

      const { data, error } = await supabase
        .from("contribution_payments")
        .update({
          status: "confirmed",
          contribution_id: result.contributionId,
          resident_id: result.residentId,
          reviewed_by: appUser.id,
          reviewed_at: now,
          review_note: reviewNote,
          updated_at: now,
        })
        .eq("id", paymentId)
        .select(PAYMENT_FIELDS)
        .single();

      if (error) throw error;
      sendJson(res, 200, { payment: { ...data, amount: Number(data.amount) } });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    handleApiError(res, error);
  }
}

/**
 * The only place this feature writes to `contributions`, and it runs once a
 * committee member has said the money actually arrived.
 *
 * A flat that already has a contribution row gets topped up - received goes
 * up, expected is left exactly as the committee set it. A flat that is new to
 * the list gets a resident and a contribution created, with expected set equal
 * to what they paid: we have no other figure to go on, and inventing a
 * per-flat default here would bake one event's convention into the app.
 */
async function applyConfirmedPayment(
  supabase: ReturnType<typeof assertServiceSupabase>,
  payment: PaymentRow,
  amount: number,
) {
  const eventId = payment.event_id;
  const flatNo = String(payment.flat_no ?? "").trim();
  const paymentReference = String(payment.payer_reference || payment.reference || "").trim();
  const receivedDate = todayInEventZone();

  let residentId: string | null = payment.resident_id ?? null;

  if (!residentId) {
    // Match the flat the committee already knows about rather than creating a
    // duplicate resident for "A-101" vs "a-101".
    const { data: matches, error: matchError } = await supabase
      .from("residents")
      .select("id,flat_no")
      .eq("event_id", eventId)
      .ilike("flat_no", flatNo)
      .limit(1);

    if (matchError) throw matchError;
    residentId = matches?.[0]?.id ?? null;
  }

  if (!residentId) {
    const { data: created, error: createError } = await supabase
      .from("residents")
      .insert({
        event_id: eventId,
        flat_no: flatNo,
        resident_name: String(payment.resident_name ?? "").trim(),
        resident_type: payment.resident_type === "Tenant" ? "Tenant" : "Owner",
        phone: payment.phone ?? null,
        interested: true,
      })
      .select("id")
      .single();

    if (createError) throw createError;
    residentId = created.id as string;
  }

  const { data: existing, error: existingError } = await supabase
    .from("contributions")
    .select("id,expected_amount,received_amount,reference")
    .eq("event_id", eventId)
    .eq("resident_id", residentId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingError) throw existingError;
  const contribution = existing?.[0];

  if (contribution) {
    const received = Number(contribution.received_amount ?? 0) + amount;
    const reference = [String(contribution.reference ?? "").trim(), paymentReference]
      .filter(Boolean)
      .join(", ")
      .slice(0, 200);

    const { error } = await supabase
      .from("contributions")
      .update({
        received_amount: received,
        received_date: receivedDate,
        payment_mode: "UPI",
        reference,
        status: "Received",
        updated_at: new Date().toISOString(),
      })
      .eq("id", contribution.id);

    if (error) throw error;
    return { contributionId: contribution.id as string, residentId };
  }

  const { data: created, error } = await supabase
    .from("contributions")
    .insert({
      event_id: eventId,
      resident_id: residentId,
      expected_amount: amount,
      received_amount: amount,
      received_date: receivedDate,
      payment_mode: "UPI",
      reference: paymentReference,
      status: "Received",
    })
    .select("id")
    .single();

  if (error) throw error;
  return { contributionId: created.id as string, residentId };
}
