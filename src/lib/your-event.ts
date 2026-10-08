/**
 * "Your event": what this resident has left to do, as a short checklist.
 *
 * A page that only describes an event is read once. A page that says "you are
 * registered, you have not paid, there is a poll waiting" is opened again, because
 * it is about *them*. Every line here is a thing the app can already do - it
 * invents no tasks - and each one names where it is done.
 *
 * Pure and import-free, so every branch is checked on its own
 * (tests/your-event.test.mjs). It is only ever built for somebody signed in:
 * without a person there is no "yours".
 */

export type ChecklistPage = "registration" | "pass" | "updates" | "volunteers";

export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  /** One line under the label. */
  detail?: string;
  /** Where it is done, and what the link says. */
  page?: ChecklistPage;
  cta?: string;
  /** Shown, but not part of "2 of 3 done": a nudge rather than a to-do. */
  optional?: boolean;
};

export type ChecklistInput = {
  signedIn: boolean;
  /** The registration page is open to this viewer and its rules have loaded. */
  registration?: {
    enabled: boolean;
    selfService: boolean;
    /** Their booking, if they have one. */
    mine: { status: "active" | "cancelled"; paymentStatus: string; amountDue: number } | null;
  } | null;
  /** Open polls this person has not voted in. */
  unvotedPolls: { id: string; title: string }[];
  /** Opportunities still looking for people (volunteer roles, performance calls). */
  openOpportunities?: number;
};

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

export function buildChecklist(input: ChecklistInput): ChecklistItem[] {
  if (!input.signedIn) return [];
  const items: ChecklistItem[] = [];

  const reg = input.registration;
  if (reg?.enabled) {
    const booking = reg.mine?.status === "active" ? reg.mine : null;

    if (!booking) {
      items.push({
        key: "register",
        label: reg.selfService ? "Register your household" : "Get your household registered",
        done: false,
        detail: reg.selfService ? "It takes a minute: your name and flat." : "The organisers add households. See how.",
        page: "registration",
        cta: reg.selfService ? "Register" : "How to register",
      });
    } else {
      items.push({ key: "register", label: "Registered", done: true });

      const confirmed = booking.paymentStatus === "verified" || booking.paymentStatus === "free";
      if (booking.amountDue > 0 && !confirmed) {
        items.push(
          booking.paymentStatus === "submitted"
            ? {
                key: "pay",
                label: "Payment submitted",
                done: false,
                detail: "Waiting for the organisers to confirm it.",
              }
            : {
                key: "pay",
                label: `Pay ${rupees(booking.amountDue)}`,
                done: false,
                detail: "Then add your UPI reference to your booking.",
                page: "registration",
                cta: "Pay",
              },
        );
      } else if (booking.amountDue > 0) {
        items.push({ key: "pay", label: "Payment confirmed", done: true });
      }

      if (confirmed) {
        items.push({ key: "pass", label: "Your pass is ready", done: true, page: "pass", cta: "Show pass" });
      }
    }
  }

  for (const poll of input.unvotedPolls.slice(0, 2)) {
    items.push({ key: `poll:${poll.id}`, label: `Vote: ${poll.title}`, done: false, page: "updates", cta: "Vote" });
  }

  if ((input.openOpportunities ?? 0) > 0) {
    items.push({
      key: "involved",
      label: "Lend a hand",
      done: false,
      detail: "There are ways to help, or to perform.",
      page: "volunteers",
      cta: "See how",
      optional: true,
    });
  }

  return items;
}

export function progress(items: ChecklistItem[]) {
  const counted = items.filter((item) => !item.optional);
  return { done: counted.filter((item) => item.done).length, total: counted.length };
}
