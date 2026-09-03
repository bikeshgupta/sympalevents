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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const supabase = assertServiceSupabase();

    // Reading bid history is public - anyone watching the auction can see the
    // chart and who is bidding without signing in. Only placing a bid (below)
    // needs a verified identity, so requireAppUser runs there instead of here.
    if (req.method === "GET") {
      const eventId = String(req.query?.eventId ?? "");
      const auctionId = String(req.query?.auctionId ?? "");

      if (!eventId || !auctionId) {
        sendJson(res, 400, { error: "eventId and auctionId are required" });
        return;
      }

      const [bidsResult, auctionResult] = await Promise.all([
        supabase
          .from("auction_bids")
          .select("id,display_name,flat_no,amount,created_at,user_id")
          .eq("event_id", eventId)
          .eq("auction_id", auctionId)
          .order("created_at", { ascending: true }),
        supabase.from("auctions").select("starting_bid,min_increment").eq("id", auctionId).maybeSingle(),
      ]);

      if (bidsResult.error) throw bidsResult.error;
      if (auctionResult.error) throw auctionResult.error;
      if (!auctionResult.data) {
        sendJson(res, 404, { error: "Auction not found" });
        return;
      }

      const startingBid = Number(auctionResult.data.starting_bid);
      const minIncrement = Number(auctionResult.data.min_increment);

      const bidderCount = new Set((bidsResult.data ?? []).map((row) => row.user_id)).size;
      const bids = (bidsResult.data ?? []).map((row) => ({
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
        minNextBid: highest ? highest + minIncrement : startingBid,
        bidderCount,
      });
      return;
    }

    if (req.method === "POST") {
      const { appUser } = await requireAppUser(req);
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

      const { data: auction, error: auctionError } = await supabase
        .from("auctions")
        .select("starting_bid,min_increment,opens_at,closes_at,status")
        .eq("id", auctionId)
        .eq("event_id", eventId)
        .maybeSingle();

      if (auctionError) throw auctionError;
      if (!auction) {
        sendJson(res, 404, { error: "Auction not found" });
        return;
      }
      if (auction.status !== "active") {
        sendJson(res, 400, { error: "This auction has been cancelled" });
        return;
      }

      const now = Date.now();
      const opensAt = new Date(auction.opens_at).getTime();
      const closesAt = new Date(auction.closes_at).getTime();

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

      const startingBid = Number(auction.starting_bid);
      const minIncrement = Number(auction.min_increment);
      const highest = topBid ? Number(topBid.amount) : null;
      const minNextBid = highest ? highest + minIncrement : startingBid;

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

      sendJson(res, 200, { bid: { ...bid, amount: Number(bid.amount) }, minNextBid: amount + minIncrement });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    handleApiError(res, error);
  }
}
