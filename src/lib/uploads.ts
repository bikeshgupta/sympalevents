import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads one image to Supabase Storage via /api/uploads (base64-in-JSON,
 * not multipart - see the server file for why) and returns its public URL.
 * Committee-only today (every current `folder` requires it server-side);
 * reused as-is for a future event-photo upload rather than being
 * auction-specific.
 */
export function useImageUpload() {
  return useMutation({
    mutationFn: async ({ file, eventId, folder }: { file: File; eventId: string; folder: string }) => {
      if (!ALLOWED_TYPES.has(file.type)) {
        throw new Error("Only JPEG, PNG, WEBP, or GIF images are allowed");
      }
      if (file.size > MAX_BYTES) {
        throw new Error(`Images must be ${Math.floor(MAX_BYTES / (1024 * 1024))}MB or smaller`);
      }

      const dataUrl = await readAsDataUrl(file);
      const { url } = await apiFetch<{ url: string }>("/api/uploads", {
        method: "POST",
        body: { eventId, folder, dataUrl },
      });
      return url;
    },
  });
}
