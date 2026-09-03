import { randomUUID } from "node:crypto";
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

const BUCKET = "uploads";
// Base64 inflates the raw file by ~1/3 inside a JSON body, so this cap keeps
// the request comfortably under typical serverless body-size limits. Plenty
// for a compressed photo; revisit if this grows into a full gallery feature
// (that would want real multipart/streamed upload instead of base64-in-JSON).
const MAX_BYTES = 4 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
// Folders currently in use, and who is allowed to write to each. Uploads are
// intentionally scoped this way rather than accepting an arbitrary folder
// string from the client - add a row here (and its own permission check
// below, if it should differ from "committee") when event-photo upload is built.
const ALLOWED_FOLDERS = new Set(["auctions"]);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const supabase = assertServiceSupabase();
    const { appUser } = await requireAppUser(req);
    const body = (await getRequestBody(req)) as { eventId?: string; folder?: string; dataUrl?: string };

    const eventId = String(body.eventId ?? "");
    const folder = String(body.folder ?? "");
    const dataUrl = String(body.dataUrl ?? "");

    if (!eventId || !folder) {
      sendJson(res, 400, { error: "eventId and folder are required" });
      return;
    }
    if (!ALLOWED_FOLDERS.has(folder)) {
      sendJson(res, 400, { error: "Unknown upload folder" });
      return;
    }

    // Every current folder is a committee-only upload. When a folder with a
    // different permission model is added, branch on `folder` here instead
    // of loosening this for everyone.
    await requireEventCommittee(eventId, appUser.id);

    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      sendJson(res, 400, { error: "Expected a base64 data URL" });
      return;
    }

    const mimeType = match[1];
    const ext = EXT_BY_MIME[mimeType];
    if (!ext) {
      sendJson(res, 400, { error: "Only JPEG, PNG, WEBP, or GIF images are allowed" });
      return;
    }

    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length === 0) {
      sendJson(res, 400, { error: "The uploaded file is empty" });
      return;
    }
    if (buffer.length > MAX_BYTES) {
      sendJson(res, 400, { error: `Images must be ${Math.floor(MAX_BYTES / (1024 * 1024))}MB or smaller` });
      return;
    }

    const path = `${folder}/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    sendJson(res, 200, { url: publicUrlData.publicUrl });
  } catch (error) {
    handleApiError(res, error);
  }
}
