import { useMemo, useState } from "react";
import {
  NoticeBlock,
  NoticeDialog,
  NoticeEmpty,
  NoticeLine,
  NoticeSheet,
  type NoticeAudience,
} from "@/features/notices/notice-sheet";
import { auctionRuntimeStatus, publishedAuctions, type Auction } from "@/lib/auctions";
import type { AppEvent } from "@/lib/event-data";
import { formatNoticeTimestamp } from "@/lib/notices";
import { formatCurrency } from "@/lib/utils";

/**
 * The auction notice - the poster that actually gets people bidding, so it
 * carries the rules in full: what is on offer, the starting bid, the minimum
 * increment, and when bidding opens and closes.
 *
 * The external copy lists only **published, live-or-upcoming** auctions (the
 * same set the dashboard shows); the committee copy adds the unpublished and
 * cancelled ones with their status, so a coordinator can see the lot.
 */
const statusWords: Record<string, string> = {
  upcoming: "Opens soon",
  live: "Bidding open",
  closed: "Bidding closed",
};

export function AuctionNoticeDialog({
  open,
  onOpenChange,
  event,
  auctions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AppEvent;
  auctions: Auction[];
}) {
  const [audience, setAudience] = useState<NoticeAudience>("external");

  const listed = useMemo(() => {
    const now = new Date();
    const sorted = [...auctions].sort((left, right) => left.opens_at.localeCompare(right.opens_at));
    if (audience === "internal") return sorted;
    return publishedAuctions(sorted).filter(
      (auction) => auction.status !== "cancelled" && auctionRuntimeStatus(auction, now) !== "closed",
    );
  }, [auctions, audience]);

  return (
    <NoticeDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Auction notice"
      documentTitle={`${event.name} - Auction`}
      audience={audience}
      onAudienceChange={setAudience}
    >
      <NoticeSheet
        eventName={event.name}
        eventDates={event.dates}
        location={event.location}
        title={listed.length === 1 ? "Auction" : "Auctions"}
        intro={
          audience === "external"
            ? "Bidding happens online in the SymPal Events app. Register once, then bid any time before it closes - the highest bid when it closes wins."
            : undefined
        }
        audience={audience}
      >
        {listed.length ? (
          listed.map((auction) => {
            const status = auctionRuntimeStatus(auction, new Date());
            return (
              <NoticeBlock
                key={auction.id}
                heading={auction.title}
                meta={
                  audience === "internal"
                    ? [statusWords[status], auction.is_published ? null : "Unpublished", auction.status === "cancelled" ? "Cancelled" : null]
                        .filter(Boolean)
                        .join(" · ")
                    : statusWords[status]
                }
              >
                {auction.description ? <p className="text-sm">{auction.description}</p> : null}
                {auction.prize ? <NoticeLine label="Prize" value={auction.prize} /> : null}
                <NoticeLine label="Starting bid" value={formatCurrency(auction.starting_bid)} />
                <NoticeLine
                  label="Each bid must beat the last by"
                  value={`at least ${formatCurrency(auction.min_increment)}`}
                />
                <NoticeLine label="Bidding opens" value={formatNoticeTimestamp(auction.opens_at)} />
                <NoticeLine label="Bidding closes" value={formatNoticeTimestamp(auction.closes_at)} />
              </NoticeBlock>
            );
          })
        ) : (
          <NoticeEmpty>
            {audience === "external"
              ? "No auction is open at the moment."
              : "No auctions have been created for this event."}
          </NoticeEmpty>
        )}

        {audience === "external" && listed.length ? (
          <NoticeBlock heading="How to take part">
            <ol className="ml-4 list-decimal space-y-1 text-sm">
              <li>Open the SymPal Events app and go to Auctions.</li>
              <li>Sign in and tap Register on the auction you want to bid on.</li>
              <li>Place your bid - you can raise it any time until bidding closes.</li>
              <li>The highest bid at closing wins. The committee will contact the winner.</li>
            </ol>
          </NoticeBlock>
        ) : null}
      </NoticeSheet>
    </NoticeDialog>
  );
}
