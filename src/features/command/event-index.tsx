import { Navigate } from "react-router-dom";
import { useViewMode } from "@/lib/view-mode";

/**
 * What an event's bare address means: where somebody starts.
 *
 * An organiser starts at the command centre - what needs attention now - and
 * everybody else at the event page. It waits for the access answer for the
 * reason the dashboard does: guessing would send every committee member to the
 * resident's home for a beat, or the reverse.
 *
 * Only the bare address is affected. `/dashboard` is still the event page, and
 * every link into it, every bookmark and every share link lands exactly where
 * it always did.
 */
export function EventIndex() {
  const view = useViewMode();
  if (view.isLoading) return null;
  return <Navigate to={view.isOrganiser && !view.isPreview ? "command" : "dashboard"} replace />;
}
