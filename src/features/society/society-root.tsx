import { Navigate } from "react-router-dom";
import { useEventContext } from "@/lib/event-context";

/**
 * What `/` means.
 *
 * A resident who belongs to a society lands on that society's events rather
 * than inside one of them - choosing an event is the first decision, and
 * dropping somebody straight into whichever event was remembered last is how
 * the app ends up feeling like it is about one event forever.
 *
 * **This is deliberately not written around a single society.** It asks how
 * many the viewer has and routes accordingly; when a second one appears, the
 * `> 1` branch becomes a chooser and nothing else moves. Today both branches
 * go to the same place because the server resolves `/society` to the viewer's
 * own, so there is nothing to choose between yet.
 *
 * With no society at all - demo mode, or Supabase unconfigured - it falls
 * through to the dashboard exactly as before, so the tour still works.
 */
export function SocietyRoot() {
  const { societies, isLoading } = useEventContext();

  // Deciding before the list has landed would send a member to the demo
  // dashboard and then bounce them, which reads as a flash of the wrong app.
  if (isLoading) return null;

  if (societies.length >= 1) return <Navigate to="/society" replace />;
  return <Navigate to="/dashboard" replace />;
}
