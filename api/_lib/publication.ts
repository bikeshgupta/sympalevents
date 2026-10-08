import { assertServiceSupabase } from "./server.js";

/** Draft access is enforced independently of module visibility, including direct links. */
export async function publicationAccess(
  eventId: string,
  userId: string | null,
) {
  const db = assertServiceSupabase();
  const result = await db
    .from("events")
    .select("status_override,organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (result.error) {
    // Existing installations before 029 have no drafts. Other errors fail closed.
    if (["42703", "PGRST204"].includes(result.error.code))
      return { canRead: true, canManage: false };
    throw result.error;
  }
  if (!result.data) return { canRead: false, canManage: false };
  if (!userId)
    return {
      canRead: result.data.status_override !== "draft",
      canManage: false,
    };
  const [event, society] = await Promise.all([
    db
      .from("event_members")
      .select("role")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("organization_members")
      .select("role")
      .eq("organization_id", result.data.organization_id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (event.error) throw event.error;
  if (society.error) throw society.error;
  const canManage =
    event.data?.role === "admin" || society.data?.role === "admin";
  const canPreview =
    canManage ||
    event.data?.role === "committee" ||
    society.data?.role === "committee";
  return {
    canRead: result.data.status_override !== "draft" || canPreview,
    canManage,
  };
}
