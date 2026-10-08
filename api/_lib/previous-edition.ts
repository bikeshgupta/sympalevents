import { publicationAccess } from "./publication.js";
import { resolvePageAccess } from "./page-visibility.js";
import type { assertServiceSupabase } from "./server.js";

/**
 * "Last time": the photographs from the edition this event was copied from.
 *
 * A Garba night that has happened before has the best advertisement it will
 * ever get sitting in the previous year's album, and the new event's page is
 * where somebody deciding whether to come is looking. `events.copied_from`
 * (039, set by api/_lib/duplicate-event.ts) is the only link between the two -
 * there is no guessing from names.
 *
 * It names the earlier event's photographs **only when this viewer could open
 * that event's closing page themselves**, and only once it has ended. The
 * album's own visibility is the rule; this is a window onto it, never a way
 * round it. It carries photographs and a count and nothing else - no names, no
 * reviews, no money. Any failure leaves the card off rather than the page down.
 */

type Supabase = ReturnType<typeof assertServiceSupabase>;

export type PreviousEdition = {
  eventId: string;
  name: string;
  startDate: string;
  photoCount: number;
  photos: { url: string; caption: string }[];
};

const MAX_PHOTOS = 6;

/** Today on the event's clock, `yyyy-mm-dd`. */
function todayInEventZone(now = new Date()) {
  return new Date(now.getTime() + 19800000).toISOString().slice(0, 10);
}

export async function loadPreviousEdition(
  supabase: Supabase,
  copiedFrom: unknown,
  viewerId: string | null,
  now = new Date(),
): Promise<PreviousEdition | null> {
  const sourceId = typeof copiedFrom === "string" ? copiedFrom : "";
  if (!/^[0-9a-f-]{36}$/i.test(sourceId)) return null;
  try {
    const [publication, closing] = await Promise.all([
      publicationAccess(sourceId, viewerId),
      resolvePageAccess(sourceId, viewerId, "closing"),
    ]);
    if (!publication.canRead || !closing.canView) return null;

    const source = await supabase.from("events").select("id,name,start_date,end_date").eq("id", sourceId).maybeSingle();
    if (source.error || !source.data) return null;
    if (String(source.data.end_date ?? "") >= todayInEventZone(now)) return null;

    const photos = await supabase
      .from("event_gallery_photos")
      .select("image_url,caption,sort_order", { count: "exact" })
      .eq("event_id", sourceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(MAX_PHOTOS);
    if (photos.error || !photos.data?.length) return null;

    return {
      eventId: sourceId,
      name: String(source.data.name ?? ""),
      startDate: String(source.data.start_date ?? ""),
      photoCount: photos.count ?? photos.data.length,
      photos: (photos.data as { image_url: string | null; caption: string | null }[])
        .filter((photo) => /^https:\/\//.test(String(photo.image_url ?? "")))
        .map((photo) => ({ url: String(photo.image_url), caption: String(photo.caption ?? "").slice(0, 200) })),
    };
  } catch {
    return null;
  }
}
