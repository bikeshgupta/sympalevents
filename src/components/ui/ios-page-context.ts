import { createContext, useContext } from "react";

/**
 * Whether the page being drawn wears the iOS-style theme: a warm grey page, white rounded cards without borders,
 * soft grey fields, small-caps table headings. It is switched on by AppLayout for the committee's working pages
 * (contributions, budget, expenses and the like) and by the new-event wizard, and read by the shared primitives
 * (Card, Button, Input). Everything else - the dashboard, auctions, the closing page - reads `false` and draws
 * exactly as before.
 */
export const IosPageContext = createContext(false);

export function useIosPage() {
  return useContext(IosPageContext);
}

/** The pages (by page key) that wear it. Presentation only: who may open a page is still the server's call. */
export const iosPageKeys = new Set([
  "contributions",
  "sponsors",
  "budget",
  "expenses",
  "tasks",
  "prasad",
  "event-plan",
  "teams",
  "fixtures",
  "volunteers",
  "contacts",
  "registration",
  "command",
  "communications",
]);
