import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { extraCoreCommittee, extraVolunteers, specialMentions } from "@/data/credits";
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

/** One prasad, and who arranged it. Names only, never flat numbers: this
 *  page can be read without signing in. */
export type PrasadCredit = {
  /** ISO date of the slot, so the page can label it "Day 3" itself. */
  date: string;
  slot: string;
  item: string;
  sponsors: string[];
};

/** Somebody who ran a whole strand of the celebration, printed under the
 *  committee list rather than as a section of their own. */
export type Shoutout = { name: string; role: string; note: string };

export type ClosingCredits = {
  /** The committee, in the order they arranged for themselves. Names only -
   *  see the privacy note in api/_lib/closing.ts. */
  core: string[];
  /** Task and schedule owners plus anybody added by hand, alphabetical. */
  volunteers: string[];
  /** Every prasad with its sponsors, in the sequence it was served. */
  prasad: PrasadCredit[];
  shoutouts: Shoutout[];
  /** The hand-kept slices of the two lists above - what the editor may
   *  remove. Everything else is derived from a real row and would come
   *  straight back. */
  manual: { core: string[]; volunteers: string[] };
  /** False until migration 020 has been run: the lists are derived-only and
   *  the page offers no editor rather than one whose save would 501. */
  editable: boolean;
};

/** An auction that finished, and what it went for. */
export type AuctionResult = {
  id: string;
  title: string;
  tag: string;
  prize: string;
  closesAt: string;
  /** Null when nobody bid before it closed. */
  winningAmount: number | null;
  /** A name, never the flat - the closing page is public. */
  winner: string | null;
  bidCount: number;
  bidderCount: number;
};

export type ClosingPayload = {
  closing: ClosingRecord;
  credits: ClosingCredits;
  /** Published, non-cancelled auctions whose close time has passed. */
  auctions: AuctionResult[];
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
      return { ...payload, credits: withSeedCredits(payload.credits) };
    },
    retry: false,
  });

  const saveNote = useMutation({
    mutationFn: (input: { headline: string; message: string }) =>
      apiFetch<{ closing: ClosingRecord }>(CLOSING_PATH, { method: "POST", body: { eventId, ...input } }),
    onSuccess: invalidate,
  });

  const saveCredits = useMutation({
    mutationFn: (input: {
      extraCore: string[];
      extraVolunteers: string[];
      coreOrder: string[];
      shoutouts: Shoutout[];
    }) => apiFetch<{ closing: ClosingRecord }>(CLOSING_PATH, { method: "PATCH", body: { eventId, ...input } }),
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
    saveCredits,
    setClosed,
    addPhoto,
    updatePhoto,
    deletePhoto,
    saveReview,
    deleteReview,
  };
}

/**
 * An empty closing payload, for demo mode and for before the server answers.
 */
export function emptyCredits(volunteers: string[] = []): ClosingCredits {
  return { core: [], volunteers, prasad: [], shoutouts: [], manual: { core: [], volunteers: [] }, editable: false };
}

/**
 * The credits, with src/data/credits.ts standing in while nothing is stored.
 *
 * That file is a **seed, not the source of truth**: once an admin saves the
 * credits from the page the stored lists win and the file is ignored, and the
 * editor preloads the seed so the first save makes those names real. It is
 * what keeps the page correct before migration 020 is run - and after it, on
 * an event whose committee has not touched the editor yet.
 *
 * (Emptying a list back out therefore brings the seed back. Worth knowing,
 * not worth a column to record "they meant nobody".)
 */
export function withSeedCredits(credits: ClosingCredits): ClosingCredits {
  return {
    ...credits,
    core: credits.manual.core.length ? credits.core : withExtraNames(credits.core, extraCoreCommittee),
    volunteers: credits.manual.volunteers.length
      ? credits.volunteers
      : withExtraNames(credits.volunteers, extraVolunteers).sort((a, b) => a.localeCompare(b)),
    shoutouts: credits.shoutouts.length ? credits.shoutouts : specialMentions,
  };
}

/** "Ankita Nagar" -> "AN". Two letters at most, so an avatar never wraps. */
export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** What the credits editor starts from - the stored lists, or the seed while
 *  those are empty, so a first save keeps the names already on the page. */
export function manualCredits(credits: ClosingCredits) {
  return {
    core: credits.manual.core.length ? credits.manual.core : [...extraCoreCommittee],
    volunteers: credits.manual.volunteers.length ? credits.manual.volunteers : [...extraVolunteers],
    shoutouts: credits.shoutouts.length ? credits.shoutouts : specialMentions.map((entry) => ({ ...entry })),
  };
}

const nameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** `names`, in the order they arrived, then whichever extras are new. */
function withExtraNames(names: string[], extras: readonly string[]) {
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
