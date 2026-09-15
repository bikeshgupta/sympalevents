import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { extraCoreCommittee, extraVolunteers } from "@/data/credits";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth";

export type ClosingRecord = {
  event_id: string;
  headline: string;
  message: string;
  is_closed: boolean;
  closed_at: string | null;
  updated_at: string | null;
};

export type GalleryPhoto = {
  id: string;
  image_url: string;
  caption: string;
  album: string;
  sort_order: number;
  created_at: string;
};

export type EventReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
  author: { name: string; photoUrl: string | null };
};

export type ClosingPayload = {
  closing: ClosingRecord;
  credits: {
    /** Committee and admin members, admins first. Names only - see the
     *  privacy note in api/_lib/closing.ts. */
    core: string[];
    volunteers: string[];
    /** Whoever arranged a prasad, from `prasad_items`. Names only, never
     *  flat numbers: this page can be read without signing in. */
    prasadSponsors: string[];
  };
  gallery: GalleryPhoto[];
  feedback: {
    average: number;
    count: number;
    distribution: Array<{ stars: number; count: number }>;
    reviews: EventReview[];
    mine: EventReview | null;
  };
};

const CLOSING_PATH = "/api/events?resource=closing";
const GALLERY_PATH = "/api/events?resource=gallery";
const FEEDBACK_PATH = "/api/events?resource=feedback";

/**
 * Everything the closing page shows, in one request: the committee's note,
 * the credits, the gallery, and the reviews.
 *
 * Reading is public - the closing page is a thank-you note for the whole
 * society, so it does not require a sign-in, the same way the dashboard does
 * not. A token is still sent when there is one, which is how the server
 * knows which review is "yours" to edit.
 */
export function useEventClosing(eventId?: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const queryKey = ["event-closing", eventId, session?.user.appUserId ?? "guest"];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["event-closing", eventId] });

  const query = useQuery({
    queryKey,
    enabled: Boolean(eventId),
    queryFn: async () => {
      const payload = await apiFetch<ClosingPayload>(`${CLOSING_PATH}&eventId=${encodeURIComponent(eventId!)}`, {
        requireAuth: false,
      });
      return { ...payload, credits: mergeCredits(payload.credits) };
    },
    retry: false,
  });

  const saveNote = useMutation({
    mutationFn: (input: { headline: string; message: string }) =>
      apiFetch<{ closing: ClosingRecord }>(CLOSING_PATH, { method: "POST", body: { eventId, ...input } }),
    onSuccess: invalidate,
  });

  const setClosed = useMutation({
    mutationFn: (closed: boolean) =>
      apiFetch<{ closing: ClosingRecord }>(CLOSING_PATH, {
        method: "PATCH",
        body: { eventId, action: closed ? "close" : "reopen" },
      }),
    onSuccess: invalidate,
  });

  const addPhoto = useMutation({
    mutationFn: (input: { imageUrl: string; caption: string; album: string; sortOrder?: number }) =>
      apiFetch<{ photo: GalleryPhoto }>(GALLERY_PATH, { method: "POST", body: { eventId, ...input } }),
    onSuccess: invalidate,
  });

  const updatePhoto = useMutation({
    mutationFn: (input: { photoId: string; caption?: string; album?: string; sortOrder?: number }) =>
      apiFetch<{ photo: GalleryPhoto }>(GALLERY_PATH, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });

  const deletePhoto = useMutation({
    mutationFn: (photoId: string) => apiFetch<{ ok: true }>(GALLERY_PATH, { method: "DELETE", body: { photoId } }),
    onSuccess: invalidate,
  });

  const saveReview = useMutation({
    mutationFn: (input: { rating: number; comment: string }) =>
      apiFetch<{ review: unknown }>(FEEDBACK_PATH, { method: "POST", body: { eventId, ...input } }),
    onSuccess: invalidate,
  });

  const deleteReview = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>(FEEDBACK_PATH, { method: "DELETE", body: { eventId } }),
    onSuccess: invalidate,
  });

  return {
    data: query.data,
    isLoading: Boolean(eventId) && query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    saveNote,
    setClosed,
    addPhoto,
    updatePhoto,
    deletePhoto,
    saveReview,
    deleteReview,
  };
}

/**
 * The server's credits plus the hand-kept names in src/data/credits.ts.
 *
 * Applied once, inside the query, so that every consumer - the closing page,
 * the dashboard card, and the generated thank-you note's counts - sees the
 * same roll and cannot drift from each other. A name the data already carries
 * is not added twice; the match is case-insensitive and ignores repeated
 * spaces, which is as much as can be done without an account to key on.
 */
export function mergeCredits(credits: ClosingPayload["credits"]): ClosingPayload["credits"] {
  return {
    core: withExtraNames(credits.core, extraCoreCommittee),
    volunteers: withExtraNames(credits.volunteers, extraVolunteers),
    prasadSponsors: credits.prasadSponsors ?? [],
  };
}

const nameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** `names`, in the order the server chose, then whichever extras are new. */
function withExtraNames(names: string[], extras: string[]) {
  const seen = new Set(names.map(nameKey));
  const merged = [...names];
  for (const extra of extras) {
    const key = nameKey(extra);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(extra.trim());
  }
  return merged;
}

/** Photos grouped by album, in the order the albums first appear. */
export function groupByAlbum(photos: GalleryPhoto[]) {
  const albums = new Map<string, GalleryPhoto[]>();
  for (const photo of photos) {
    const key = photo.album.trim() || "Celebration";
    const existing = albums.get(key);
    if (existing) existing.push(photo);
    else albums.set(key, [photo]);
  }
  return [...albums.entries()].map(([album, items]) => ({ album, items }));
}

/** "4.6" - one decimal, the way a rating is normally written. */
export function formatRating(average: number) {
  return average > 0 ? average.toFixed(1) : "—";
}
