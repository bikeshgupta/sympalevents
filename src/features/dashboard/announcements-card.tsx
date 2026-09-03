import { Bell, ChevronLeft, ChevronRight, Clock3, Gavel, MapPin, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import auctionImage from "@/features/dashboard/auction.png";
import { formatEventDate, formatEventTime } from "@/features/dashboard/dashboard-utils";
import type { AnnouncementArt } from "@/data/announcements";
import {
  auctionStatus,
  closesInLabel,
  leadTimeLabel,
  resolveAnnouncements,
  type ResolvedAnnouncement,
} from "@/lib/announcements";
import type { AppEvent } from "@/lib/event-data";
import { usePrefersReducedMotion } from "@/lib/motion";

const ROTATE_MS = 8000;

/** Maps an announcement's `art` key to its illustration. Add an entry here
 *  alongside a new `AnnouncementArt` value to give another notice artwork. */
const ART_IMAGES: Record<AnnouncementArt, string> = {
  "laddoo-auction": auctionImage,
};

export function AnnouncementsCard({ event, now }: { event: AppEvent; now: Date }) {
  const items = useMemo(() => resolveAnnouncements(event), [event]);
  const prefersReduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [event.id]);

  useEffect(() => {
    if (items.length < 2 || paused || prefersReduced) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % items.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [items.length, paused, prefersReduced]);

  if (!items.length) return null;

  const active = items[Math.min(index, items.length - 1)];
  const lead = leadTimeLabel(active, now);
  const isLive = lead === "Happening now";
  const isDone = lead === "Completed";
  const isSpotlight = active.tone === "spotlight" && !isDone;

  return (
    <Card
      className="overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <CardTitle>News &amp; Announcements</CardTitle>
          </div>
          <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div
          key={active.id}
          className={`relative overflow-hidden rounded-lg border p-2.5 animate-fade-up ${
            isSpotlight
              ? "border-primary/25 bg-[linear-gradient(120deg,hsl(var(--accent))_0%,hsl(var(--secondary))_45%,hsl(var(--accent))_100%)] bg-[length:200%_200%] animate-gradient-pan"
              : "bg-muted/50"
          }`}
          role="group"
          aria-roledescription="announcement"
          aria-label={active.title}
        >
          {/* The "lucid" sweep: a soft band of light travelling across the card. */}
          {isSpotlight ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/55 to-transparent"
            />
          ) : null}

          {/*
           * Fixed 60/40 split: details left, illustration right, at every
           * breakpoint. The image is capped small (a badge-sized accent, not a
           * hero illustration) so it never becomes the tallest thing in the
           * row - the notice should read compact even with a picture attached.
           */}
          <div className="relative grid grid-cols-[3fr_2fr] items-center gap-2 sm:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isDone ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                  }`}
                >
                  <Sparkles className={`h-3 w-3 ${isDone ? "" : "animate-pulse-soft"}`} aria-hidden="true" />
                  {active.tag}
                </span>
                {isLive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-600" aria-hidden="true" />
                    Live now
                  </span>
                ) : lead ? (
                  <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
                    {lead}
                  </span>
                ) : null}
              </div>

              <h3 className="mt-1.5 text-sm font-semibold leading-snug sm:text-base">{active.title}</h3>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{active.body}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {active.day ? (
                  <span className="font-medium text-foreground">
                    {active.day}
                    {active.resolvedDate ? ` · ${formatEventDate(active.resolvedDate)}` : ""}
                  </span>
                ) : active.resolvedDate ? (
                  <span className="font-medium text-foreground">{formatEventDate(active.resolvedDate)}</span>
                ) : null}
                {active.time ? (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {formatEventTime(active.time)}
                  </span>
                ) : null}
                {active.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {active.location}
                  </span>
                ) : null}
              </div>
            </div>

            {active.art ? (
              // ~2.5x the compact size (56px -> 144px mobile, 64px -> 160px desktop)
              // - there is enough width in the 40% column to show it properly,
              // especially on the phone-first majority of traffic.
              <img
                src={ART_IMAGES[active.art]}
                alt=""
                aria-hidden="true"
                className="max-h-36 w-full object-contain justify-self-end sm:max-h-40"
              />
            ) : null}
          </div>

          {active.auctionWindow ? <AuctionPanel announcement={active} now={now} /> : null}
        </div>

        {items.length > 1 ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Announcements">
              {items.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={itemIndex === index}
                  aria-label={item.title}
                  onClick={() => setIndex(itemIndex)}
                  className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    itemIndex === index ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Previous announcement"
                onClick={() => setIndex((current) => (current - 1 + items.length) % items.length)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Next announcement"
                onClick={() => setIndex((current) => (current + 1) % items.length)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Placeholder for the online laddoo auction. Shows the bidding window and its
 * status; the bid control is intentionally inert until real bidding is built.
 */
function AuctionPanel({ announcement, now }: { announcement: ResolvedAnnouncement; now: Date }) {
  const window = announcement.auctionWindow;
  if (!window) return null;

  const status = auctionStatus(announcement, now);
  const closesIn = closesInLabel(announcement, now);
  const isLive = status === "live";

  return (
    <div className="relative mt-2.5 rounded-lg border border-primary/20 bg-background/70 p-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
          Online auction
        </span>
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-600" aria-hidden="true" />
            Bidding open
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {status === "closed" ? "Bidding closed" : "Not open yet"}
          </span>
        )}
      </div>

      {/* Full Opens/Closes detail, always - nothing here truncates, on a phone
          included, since this is exactly the information a bidder needs. */}
      <div className="mt-2.5 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Opens</p>
          <p className="mt-0.5 font-medium tabular-nums text-foreground">{formatEventDate(window.opensDate)}</p>
          <p className="tabular-nums text-muted-foreground">{formatEventTime(window.opensTime)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Closes</p>
          <p className="mt-0.5 font-medium tabular-nums text-foreground">{formatEventDate(window.closesDate)}</p>
          <p className="tabular-nums text-muted-foreground">{formatEventTime(window.closesTime)}</p>
        </div>
      </div>

      {isLive && closesIn ? (
        <p className="mt-2 text-xs font-medium text-emerald-700">Closes in {closesIn}</p>
      ) : null}

      {/* Full width on a phone so the button's weight matches the panel
          instead of sitting as a small pill in a mostly-empty row. */}
      <Button disabled title="Online bidding is not available yet - coming soon" className="mt-3 w-full sm:w-auto">
        <Gavel className="h-4 w-4" aria-hidden="true" />
        Place a bid - coming soon
      </Button>
    </div>
  );
}
