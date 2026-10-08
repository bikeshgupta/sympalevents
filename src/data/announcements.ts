/**
 * Committee announcements shown in the dashboard News & Announcements section
 * and in the header bell.
 *
 * Organisers now write and publish these in the app, and they live in the
 * `event_announcements` table (see api/_lib/announcements.ts). This file is
 * what is shown when there is no event to ask - the demo - and nothing else:
 * its entries are never merged into a real event's list. It is an empty array
 * and is meant to stay one.
 *
 * The fields below are the same whichever side they come from.
 *
 * - `day`   : matches the dashboard's day tabs ("Day 1", "Day 2", ...). The real
 *             calendar date is resolved from the event, so this stays correct
 *             even if the event dates move.
 * - `date`  : optional explicit "yyyy-mm-dd" override, used when a notice is not
 *             tied to an event day.
 * - `time`  : optional "HH:mm" in event time (Asia/Kolkata).
 * - `tone`  : "spotlight" is the highlighted hero treatment - use it sparingly,
 *             for the one thing you most want people to see.
 *
 * Auctions used to be a notice field here (`art`/`auction`/`prize`) but are
 * now their own user-created data - see src/features/auctions and the
 * `auctions` database table. This file is for plain text notices only.
 */

export type AnnouncementTone = "spotlight" | "info" | "alert";

export type Announcement = {
  id: string;
  tag: string;
  title: string;
  body: string;
  tone: AnnouncementTone;
  day?: string;
  date?: string;
  time?: string;
  location?: string;
  /** Optional: limit a notice to one event. Leave undefined to show for all. */
  eventId?: string;
  /** What sort of post this is. Only "message" exists today. */
  kind?: string;
  /** Drafts are sent only to somebody who can edit the dashboard. Absent
   *  means published, which is what every notice in this file is. */
  status?: "draft" | "published";
  /** Shown before newer posts. */
  pinned?: boolean;
  createdAt?: string;
  publishedAt?: string | null;
};

export const announcements: Announcement[] = [];
