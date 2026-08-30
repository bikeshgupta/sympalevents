import { handleApiError, requireAppUser, sendJson } from "./_lib/server";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const { appUser } = await requireAppUser(req);
    sendJson(res, 200, { user: appUser });
  } catch (error) {
    handleApiError(res, error);
  }
}
