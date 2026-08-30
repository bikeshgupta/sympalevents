import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useCurrentPageAccess } from "@/lib/page-access";

export function RouteGuard() {
  const location = useLocation();
  const access = useCurrentPageAccess();

  if (access.isLoading) {
    return <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Checking access...</div>;
  }

  if (access.requiresLogin) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!access.canView) {
    return <Navigate to="/access-denied" replace />;
  }

  return <Outlet />;
}
