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
 */

export type AnnouncementTone = "spotlight" | "info" | "alert";

/** Optional illustration rendered beside a notice. Add a case here and in
 *  announcements-card.tsx to introduce another scene. */
export type AnnouncementArt = "laddoo-auction";

/**
 * An online bidding window. Days are resolved against the event, same as a
 * notice's own `day`, so the window follows if the event dates move. Give a
 * `date` ("yyyy-mm-dd") instead to pin it to a fixed calendar day.
 */
export type AnnouncementAuction = {
  opensDay?: string;
  opensDate?: string;
  opensTime: string;
  closesDay?: string;
  closesDate?: string;
  closesTime: string;
};

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
  art?: AnnouncementArt;
  auction?: AnnouncementAuction;
  /** Optional: limit a notice to one event. Leave undefined to show for all. */
  eventId?: string;
};

export const announcements: Announcement[] = [
  {
    id: "laddoo-auction-day-3",
    tag: "Laddoo Auction",
    title: "Laddoo Auction on Day 3",
    body: "Bidding for Bappa's laddoo happens online, right here. Bid generously - every rupee raised goes straight into the event fund.",
    tone: "spotlight",
    art: "laddoo-auction",
    auction: {
      opensDay: "Day 1",
      opensTime: "08:30",
      closesDay: "Day 3",
      closesTime: "10:00",
    },
  },
];
