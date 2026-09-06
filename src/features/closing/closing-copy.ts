import type { ClosingPayload } from "@/lib/closing";
import { formatCurrency } from "@/lib/utils";

export type ClosingFacts = {
  eventName: string;
  location: string;
  dayCount: number;
  eventCount: number;
  contributorCount: number;
  contributionReceived: number;
  sponsorCount: number;
  sponsorshipReceived: number;
  coreCount: number;
  volunteerCount: number;
};

function list(parts: string[]) {
  const filled = parts.filter(Boolean);
  if (filled.length <= 1) return filled.join("");
  return `${filled.slice(0, -1).join(", ")} and ${filled.at(-1)}`;
}

export function defaultClosingHeadline(facts: ClosingFacts) {
  return facts.location ? `Thank you, ${facts.location}` : "Thank you, everyone";
}

/**
 * The thank-you note the page opens with, written from the event's own
 * numbers so it is never a blank box and never credits the wrong people.
 * The committee can rewrite it word for word - this is only what they start
 * from, and what a resident reads if nobody ever gets around to it.
 */
export function defaultClosingMessage(facts: ClosingFacts) {
  const days = facts.dayCount === 1 ? "a day" : `${facts.dayCount} days`;
  const total = facts.contributionReceived + facts.sponsorshipReceived;

  const who = list([
    facts.contributorCount ? `${facts.contributorCount} families contributed` : "",
    facts.sponsorCount ? `${facts.sponsorCount} sponsors backed us` : "",
    facts.volunteerCount ? `${facts.volunteerCount} volunteers ran the ground` : "",
  ]);

  const paragraphs = [
    `${facts.eventName} is over, and it was never one person's doing.`,
    who
      ? `Across ${days}${facts.eventCount ? ` and ${facts.eventCount} events` : ""}, ${who}. Together that is ${formatCurrency(total)} raised and spent on all of us.`
      : `Across ${days}, this was put together entirely by the people who live here.`,
    facts.coreCount
      ? `The ${facts.coreCount}-member committee planned it, but the mandap did not decorate itself, the prasad did not count itself, and the sound system did not carry itself up the stairs.`
      : "",
    "To everyone who donated, cooked, carried, decorated, sang, danced, kept accounts, swept up afterwards, or simply turned up and sang along - thank you. Every single name on this page is the reason it happened, and none of it would have been possible without any one of you.",
    "See you next year.",
  ];

  return paragraphs.filter(Boolean).join("\n\n");
}

/** What the committee wrote, or the generated note when they have not yet. */
export function closingText(closing: ClosingPayload["closing"] | undefined, facts: ClosingFacts) {
  return {
    headline: closing?.headline?.trim() || defaultClosingHeadline(facts),
    message: closing?.message?.trim() || defaultClosingMessage(facts),
    isDefault: !closing?.message?.trim(),
  };
}
