import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Announcement, AnnouncementTone } from "@/data/announcements";
import { apiFetch } from "@/lib/api";

/**
 * Writing announcements. Reading is not here: they travel with the event in
 * `useEventData().announcements`, so a post adds no request of its own - see
 * api/_lib/announcements.ts.
 */

/** What the server sends for one post. Absent values are `null`, not missing. */
export type AnnouncementPostPayload = {
  id: string;
  kind: string;
  tag: string;
  title: string;
  body: string;
  tone: string;
  day: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  status: "draft" | "published";
  pinned: boolean;
  createdAt: string;
  publishedAt: string | null;
};

/** The shape the card and the bell already render. `null` becomes absent so
 *  they keep reading `item.day`, `item.time` and the rest exactly as before. */
export function toAnnouncement(post: AnnouncementPostPayload): Announcement {
  const tone: AnnouncementTone = post.tone === "spotlight" || post.tone === "alert" ? post.tone : "info";
  return {
    id: post.id,
    kind: post.kind,
    tag: post.tag,
    title: post.title,
    body: post.body,
    tone,
    day: post.day ?? undefined,
    date: post.date ?? undefined,
    time: post.time ?? undefined,
    location: post.location ?? undefined,
    status: post.status,
    pinned: post.pinned,
    createdAt: post.createdAt,
    publishedAt: post.publishedAt,
  };
}

export type AnnouncementInput = {
  title: string;
  body: string;
  tag: string;
  tone: AnnouncementTone;
  /** `yyyy-mm-dd`, or empty for none. */
  date: string;
  /** `HH:mm`, or empty for none. */
  time: string;
  location: string;
  pinned: boolean;
};

export function useAnnouncementPosts(eventId?: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["event-data"] });
  const url = "/api/events?resource=announcements";

  const create = useMutation({
    mutationFn: (input: AnnouncementInput & { status: "draft" | "published" }) =>
      apiFetch<{ announcement: AnnouncementPostPayload }>(url, { method: "POST", body: { eventId, ...input } }),
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: ({ id, ...changes }: { id: string } & Partial<AnnouncementInput & { status: "draft" | "published" }>) =>
      apiFetch<{ announcement: AnnouncementPostPayload }>(url, { method: "PATCH", body: { id, ...changes } }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`${url}&id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  return { create, update, remove };
}
