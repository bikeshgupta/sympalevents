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
    const { appUser } = await requireAppUser(req);

    if (req.method === "GET") {
      const eventId = String(req.query?.eventId ?? "");
      const auctionId = String(req.query?.auctionId ?? "");

      if (!eventId || !auctionId) {
        sendJson(res, 400, { error: "eventId and auctionId are required" });
        return;
      }

      const [mineResult, countResult] = await Promise.all([
        supabase
          .from("auction_registrations")
          .select("id,display_name,flat_no,phone,status,created_at")
          .eq("event_id", eventId)
          .eq("auction_id", auctionId)
          .eq("user_id", appUser.id)
          .maybeSingle(),
        supabase
          .from("auction_registrations")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("auction_id", auctionId)
          .eq("status", "registered"),
      ]);

      if (mineResult.error) throw mineResult.error;
      if (countResult.error) throw countResult.error;

      const mine = mineResult.data;
      sendJson(res, 200, {
        registration: mine && mine.status === "registered" ? mine : null,
        count: countResult.count ?? 0,
      });
      return;
    }

    if (req.method === "POST") {
      const body = await getRequestBody(req);
      const eventId = String(body.eventId ?? "");
      const auctionId = String(body.auctionId ?? "");
      const displayName = String(body.name ?? "").trim();
      const flatNo = String(body.flat ?? "").trim();
      const phone = String(body.phone ?? "").trim();

      if (!eventId || !auctionId) {
        sendJson(res, 400, { error: "eventId and auctionId are required" });
        return;
      }
      if (!displayName) {
        sendJson(res, 400, { error: "Name is required" });
        return;
      }
      if (!flatNo) {
        sendJson(res, 400, { error: "Flat number is required" });
        return;
      }
      if (!phone) {
        sendJson(res, 400, { error: "Phone number is required" });
        return;
      }

      const { data, error } = await supabase
        .from("auction_registrations")
        .upsert(
          {
            event_id: eventId,
            auction_id: auctionId,
            user_id: appUser.id,
            display_name: displayName,
            flat_no: flatNo,
            phone,
            status: "registered",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "event_id,auction_id,user_id" },
        )
        .select("id,display_name,flat_no,phone,status,created_at")
        .single();

      if (error) throw error;
      sendJson(res, 200, { registration: data });
      return;
    }

    if (req.method === "DELETE") {
      const body = await getRequestBody(req);
      const eventId = String(body.eventId ?? "");
      const auctionId = String(body.auctionId ?? "");

      if (!eventId || !auctionId) {
        sendJson(res, 400, { error: "eventId and auctionId are required" });
        return;
      }

      const { error } = await supabase
        .from("auction_registrations")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("event_id", eventId)
        .eq("auction_id", auctionId)
        .eq("user_id", appUser.id);

      if (error) throw error;
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    handleApiError(res, error);
  }
}
