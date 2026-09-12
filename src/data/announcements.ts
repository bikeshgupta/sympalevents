/**
 * Committee announcements shown in the dashboard News & Announcements section
 * and in the header bell.
 *
 * This is deliberately a plain file, not a database table - edit it, commit,
 * and the change ships with the next deploy. To add a notice, copy an entry and
 * change the fields.
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
};

export const announcements: Announcement[] = [];
