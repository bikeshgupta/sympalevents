import { Navigate, Outlet, useLocation } from "react-router-dom";
import { WelcomePanel } from "@/features/onboarding/welcome-panel";
import { useSession } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useCurrentPageAccess } from "@/lib/page-access";
import { isSupabaseConfigured } from "@/lib/supabase";

export function RouteGuard() {
  const location = useLocation();
  const access = useCurrentPageAccess();
  const { data: session } = useSession();
  const { events, selectedEventId, isLoading: isEventLoading } = useEventContext();

  if (access.isLoading || isEventLoading) {
    return <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Checking access...</div>;
  }

  /**
   * Signed in, and part of nothing yet.
   *
   * Before this, a new account landed on a dashboard full of the demo Ganesh
   * Chaturthi with a badge explaining the data was not real, which reads as a
   * broken app rather than an empty one. Demo mode is still what an
   * unconfigured deployment shows - that check is `isSupabaseConfigured`.
   */
  if (isSupabaseConfigured && session && !selectedEventId && !events.length) {
    return <WelcomePanel />;
  }

  if (access.requiresLogin) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!access.canView) {
    return <Navigate to="/access-denied" replace />;
  }

  return <Outlet />;
}
