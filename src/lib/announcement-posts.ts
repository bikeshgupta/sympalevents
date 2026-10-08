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
  payload?: Record<string, unknown>;
  viewerVoted?: boolean;
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
    payload: post.payload ?? {},
    viewerVoted: post.viewerVoted,
    createdAt: post.createdAt,
    publishedAt: post.publishedAt,
  };
}

export type AnnouncementKind = "message" | "poll" | "ask";

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
  /** Only sent when a post is created; what a post is cannot change afterwards. */
  kind?: AnnouncementKind;
  /** A poll's options and rule, or an ask's closing time. */
  payload?: Record<string, unknown>;
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

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** A date and time typed in the event's own clock (Asia/Kolkata), as the ISO
 *  instant the server stores. Both blank means "never closes". */
export function closesAtFromParts(date: string, time: string) {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hours = 23, minutes = 59] = (time || "23:59").split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - IST_OFFSET_MS).toISOString();
}

/** The reverse, for filling the form back in when a post is edited. */
export function closesAtToParts(iso: unknown) {
  if (typeof iso !== "string" || !iso) return { date: "", time: "" };
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  if (Number.isNaN(shifted.getTime())) return { date: "", time: "" };
  const text = shifted.toISOString();
  return { date: text.slice(0, 10), time: text.slice(11, 16) };
}
