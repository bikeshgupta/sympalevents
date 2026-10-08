import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { readAsDataUrl, shrinkImage } from "@/lib/images";

/**
 * The signed-in person's own profile: name, photograph, and the flat and phone that start
 * their forms filled in. See api/me.ts - flat and phone are private, and come back to their
 * owner only.
 *
 * `ready` is false until migration 041 is run; the page says so rather than offering fields
 * that would not save.
 */

export type Profile = { ready: boolean; customPhotoUrl: string | null; flat: string; phone: string };

type MeResponse = {
  user: { id: string; email: string; full_name: string | null; photo_url: string | null; google_photo_url: string | null };
  profile: Profile;
};

export type ProfileChanges = { fullName?: string; flat?: string; phone?: string; photoUrl?: string | null };

export function useProfile() {
  const { data: session } = useSession();
  const client = useQueryClient();
  const appUserId = session?.user.appUserId ?? null;

  const query = useQuery({
    queryKey: ["profile", appUserId],
    enabled: Boolean(appUserId),
    queryFn: () => apiFetch<MeResponse>("/api/me"),
  });

  const save = useMutation({
    mutationFn: (changes: ProfileChanges) => apiFetch<MeResponse>("/api/me", { method: "PATCH", body: changes }),
    onSuccess: async () => {
      // The session carries the name and photograph every avatar in the app reads.
      await Promise.all([
        client.invalidateQueries({ queryKey: ["profile"] }),
        client.invalidateQueries({ queryKey: ["session"] }),
        client.invalidateQueries({ queryKey: ["event-members"] }),
        client.invalidateQueries({ queryKey: ["event-closing"] }),
      ]);
    },
  });

  return { query, save };
}

/** Just the two fields a form starts from. Empty strings until loaded, or when 041 is not run. */
export function useProfileDefaults() {
  const { data: session } = useSession();
  const profile = useProfile().query.data;
  return {
    name: session?.user.name ?? "",
    flat: profile?.profile.flat ?? "",
    phone: profile?.profile.phone ?? "",
    loaded: Boolean(profile),
  };
}

/** Shrinks a chosen photograph on the device (a profile picture is never shown bigger than
 *  a few hundred pixels) and uploads it under the person's own folder. Returns its URL. */
export async function uploadAvatar(file: File) {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, WEBP or GIF image");
  }
  const blob = await shrinkImage(file, 512, 0.85);
  const dataUrl = await readAsDataUrl(blob);
  const { url } = await apiFetch<{ url: string }>("/api/uploads", { method: "POST", body: { folder: "profiles", dataUrl } });
  return url;
}
