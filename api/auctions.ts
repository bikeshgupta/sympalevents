import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  requireEventCommittee,
  sendJson,
} from "./_lib/server.js";

type ApiRequest = {
  method?: string;
  query?: {
    eventId?: string | string[];
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

const AUCTION_FIELDS =
  "id,event_id,title,tag,description,prize,image_url,starting_bid,min_increment,opens_at,closes_at,status,is_published,created_at";

function toAuction(row: Record<string, unknown>) {
  return {
    ...row,
    starting_bid: Number(row.starting_bid),
    min_increment: Number(row.min_increment),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const supabase = assertServiceSupabase();

    if (req.method === "GET") {
      const eventId = String(req.query?.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }

      const { data, error } = await supabase
        .from("auctions")
        .select(AUCTION_FIELDS)
        .eq("event_id", eventId)
        .eq("status", "active")
        .order("opens_at", { ascending: true });

      if (error) throw error;
      sendJson(res, 200, { auctions: (data ?? []).map(toAuction) });
      return;
    }

    // Every write below needs a signed-in committee member for the event.
    const { appUser } = await requireAppUser(req);

    if (req.method === "POST") {
      const body = (await getRequestBody(req)) as Record<string, unknown>;
      const eventId = String(body.eventId ?? "");
      if (!eventId) {
        sendJson(res, 400, { error: "eventId is required" });
        return;
      }
      await requireEventCommittee(eventId, appUser.id);

      const title = String(body.title ?? "").trim();
      const description = String(body.description ?? "").trim();
      const prize = String(body.prize ?? "").trim();
      const tag = String(body.tag ?? "").trim() || "Auction";
      const imageUrl = String(body.imageUrl ?? "").trim();
      const startingBid = Number(body.startingBid);
      const minIncrement = Number(body.minIncrement);
      const opensDate = new Date(String(body.opensAt ?? ""));
      const closesDate = new Date(String(body.closesAt ?? ""));

      if (!title) {
        sendJson(res, 400, { error: "Title is required" });
        return;
      }
      if (!Number.isFinite(startingBid) || startingBid <= 0) {
        sendJson(res, 400, { error: "Enter a valid starting bid" });
        return;
      }
      if (!Number.isFinite(minIncrement) || minIncrement <= 0) {
        sendJson(res, 400, { error: "Enter a valid minimum increment" });
        return;
      }
      if (Number.isNaN(opensDate.getTime()) || Number.isNaN(closesDate.getTime())) {
        sendJson(res, 400, { error: "Enter valid opening and closing times" });
        return;
      }
      if (closesDate <= opensDate) {
        sendJson(res, 400, { error: "Closing time must be after the opening time" });
        return;
      }

      const { data, error } = await supabase
        .from("auctions")
        .insert({
          event_id: eventId,
          title,
          tag,
          description,
          prize: prize || null,
          image_url: imageUrl || null,
          starting_bid: startingBid,
          min_increment: minIncrement,
          opens_at: opensDate.toISOString(),
          closes_at: closesDate.toISOString(),
          created_by: appUser.id,
        })
        .select(AUCTION_FIELDS)
        .single();

      if (error) throw error;
      sendJson(res, 200, { auction: toAuction(data) });
      return;
    }

    if (req.method === "PATCH") {
      const body = (await getRequestBody(req)) as Record<string, unknown>;
      const auctionId = String(body.auctionId ?? "");
      if (!auctionId) {
        sendJson(res, 400, { error: "auctionId is required" });
        return;
      }

      const { data: existing, error: fetchError } = await supabase
        .from("auctions")
        .select("event_id")
        .eq("id", auctionId)
        .single();

      if (fetchError) throw fetchError;
      await requireEventCommittee(existing.event_id, appUser.id);

      if (body.action === "cancel") {
        const { error } = await supabase
          .from("auctions")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", auctionId);

        if (error) throw error;
        sendJson(res, 200, { ok: true });
        return;
      }

      if (body.action === "publish" || body.action === "unpublish") {
        const { data, error } = await supabase
          .from("auctions")
          .update({ is_published: body.action === "publish", updated_at: new Date().toISOString() })
          .eq("id", auctionId)
          .select(AUCTION_FIELDS)
          .single();

        if (error) throw error;
        sendJson(res, 200, { auction: toAuction(data) });
        return;
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) updates.title = String(body.title).trim();
      if (body.tag !== undefined) updates.tag = String(body.tag).trim() || "Auction";
      if (body.description !== undefined) updates.description = String(body.description).trim();
      if (body.prize !== undefined) updates.prize = String(body.prize).trim() || null;
      if (body.imageUrl !== undefined) updates.image_url = String(body.imageUrl).trim() || null;
      if (body.startingBid !== undefined) {
        const value = Number(body.startingBid);
        if (!Number.isFinite(value) || value <= 0) {
          sendJson(res, 400, { error: "Enter a valid starting bid" });
          return;
        }
        updates.starting_bid = value;
      }
      if (body.minIncrement !== undefined) {
        const value = Number(body.minIncrement);
        if (!Number.isFinite(value) || value <= 0) {
          sendJson(res, 400, { error: "Enter a valid minimum increment" });
          return;
        }
        updates.min_increment = value;
      }
      if (body.opensAt !== undefined) updates.opens_at = new Date(String(body.opensAt)).toISOString();
      if (body.closesAt !== undefined) updates.closes_at = new Date(String(body.closesAt)).toISOString();

      const { data, error } = await supabase
        .from("auctions")
        .update(updates)
        .eq("id", auctionId)
        .select(AUCTION_FIELDS)
        .single();

      if (error) throw error;
      sendJson(res, 200, { auction: toAuction(data) });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    handleApiError(res, error);
  }
}
