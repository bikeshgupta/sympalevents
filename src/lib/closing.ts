import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    queryFn: () =>
      apiFetch<ClosingPayload>(`${CLOSING_PATH}&eventId=${encodeURIComponent(eventId!)}`, { requireAuth: false }),
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
