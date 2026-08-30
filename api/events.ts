import {
  assertServiceSupabase,
  getRequestBody,
  handleApiError,
  requireAppUser,
  sendJson,
} from "./_lib/server.js";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);
    const body = await getRequestBody(req);

    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .insert({ name: `${body.eventName} Organization` })
      .select("id")
      .single();

    if (organizationError) throw organizationError;

    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        organization_id: organization.id,
        name: body.eventName,
        start_date: body.startDate,
        end_date: body.endDate,
        location: body.location ?? "",
        description: body.description ?? "",
      })
      .select("id")
      .single();

    if (eventError) throw eventError;

    const { error: memberError } = await supabase.from("event_members").insert({
      event_id: event.id,
      user_id: appUser.id,
      role: "admin",
    });

    if (memberError) throw memberError;

    sendJson(res, 201, { eventId: event.id });
  } catch (error) {
    handleApiError(res, error);
  }
}
