import { assertServiceSupabase, getRequestBody, handleApiError, requireAppUser, sendJson } from "./_lib/server.js";

type ApiRequest = {
  method?: string;
  query?: {
    eventId?: string | string[];
    auctionId?: string | string[];
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

const STARTING_BID = 5000;
const MIN_INCREMENT = 100;
const KOLKATA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Bidding windows, keyed by auction id (an announcement's `id`).
 *
 * The auction's schedule lives client-side in src/data/announcements.ts (see
 * the `auction` field on the matching entry) because announcements are a
 * plain data file, not a database table. This is a deliberate, minimal mirror
 * of just the two day-offsets and times needed to enforce "no bidding outside
 * the window" server-side - update BOTH places if the window ever changes.
 */
const AUCTION_WINDOWS: Record<
  string,
  { opensDayOffset: number; opensTime: string; closesDayOffset: number; closesTime: string }
> = {
  "laddoo-auction-day-3": { opensDayOffset: 0, opensTime: "08:30", closesDayOffset: 2, closesTime: "10:00" },
};

/** Mirrors dashboard-utils.ts's toEventZoneTimestamp - event days are anchored to Asia/Kolkata. */
function eventZoneTimestamp(dateStr: string, time: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes, 0) - KOLKATA_OFFSET_MS;
}

function addDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);

    if (req.method === "GET") {
      const eventId = String(req.query?.eventId ?? "");
      const auctionId = String(req.query?.auctionId ?? "");

      if (!eventId || !auctionId) {
        sendJson(res, 400, { error: "eventId and auctionId are required" });
        return;
      }

      const { data, error } = await supabase
        .from("auction_bids")
        .select("id,display_name,flat_no,amount,created_at,user_id")
        .eq("event_id", eventId)
        .eq("auction_id", auctionId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const bidderCount = new Set((data ?? []).map((row) => row.user_id)).size;
      const bids = (data ?? []).map((row) => ({
        id: row.id,
        display_name: row.display_name,
        flat_no: row.flat_no,
        amount: Number(row.amount),
        created_at: row.created_at,
      }));
      const highest = bids.length ? bids[bids.length - 1].amount : null;

      sendJson(res, 200, {
        bids,
        highest,
        minNextBid: highest ? highest + MIN_INCREMENT : STARTING_BID,
        bidderCount,
      });
      return;
    }

    if (req.method === "POST") {
      const body = (await getRequestBody(req)) as { eventId?: string; auctionId?: string; amount?: number };
      const eventId = String(body.eventId ?? "");
      const auctionId = String(body.auctionId ?? "");
      const amount = Number(body.amount);

      if (!eventId || !auctionId) {
        sendJson(res, 400, { error: "eventId and auctionId are required" });
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { error: "Enter a valid bid amount" });
        return;
      }

      const window = AUCTION_WINDOWS[auctionId];
      if (!window) {
        sendJson(res, 400, { error: "Bidding is not configured for this auction" });
        return;
      }

      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("start_date")
        .eq("id", eventId)
        .single();

      if (eventError) throw eventError;

      const opensAt = eventZoneTimestamp(addDays(event.start_date, window.opensDayOffset), window.opensTime);
      const closesAt = eventZoneTimestamp(addDays(event.start_date, window.closesDayOffset), window.closesTime);
      const now = Date.now();

      if (now < opensAt) {
        sendJson(res, 400, { error: "Bidding hasn't opened yet" });
        return;
      }
      if (now > closesAt) {
        sendJson(res, 400, { error: "Bidding has closed for this auction" });
        return;
      }

      const { data: registration, error: registrationError } = await supabase
        .from("auction_registrations")
        .select("display_name,flat_no")
        .eq("event_id", eventId)
        .eq("auction_id", auctionId)
        .eq("user_id", appUser.id)
        .eq("status", "registered")
        .maybeSingle();

      if (registrationError) throw registrationError;
      if (!registration) {
        sendJson(res, 403, { error: "Register for this auction before placing a bid" });
        return;
      }

      const { data: topBid, error: topBidError } = await supabase
        .from("auction_bids")
        .select("amount")
        .eq("event_id", eventId)
        .eq("auction_id", auctionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (topBidError) throw topBidError;

      const highest = topBid ? Number(topBid.amount) : null;
      const minNextBid = highest ? highest + MIN_INCREMENT : STARTING_BID;

      if (amount < minNextBid) {
        sendJson(res, 400, { error: `Minimum bid is ₹${minNextBid.toLocaleString("en-IN")}` });
        return;
      }

      const { data: bid, error: insertError } = await supabase
        .from("auction_bids")
        .insert({
          event_id: eventId,
          auction_id: auctionId,
          user_id: appUser.id,
          display_name: registration.display_name,
          flat_no: registration.flat_no,
          amount,
        })
        .select("id,display_name,flat_no,amount,created_at")
        .single();

      if (insertError) throw insertError;

      sendJson(res, 200, { bid: { ...bid, amount: Number(bid.amount) }, minNextBid: amount + MIN_INCREMENT });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    handleApiError(res, error);
  }
}
