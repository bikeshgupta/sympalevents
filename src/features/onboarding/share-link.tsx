import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";

/**
 * `/s/<token>` - the permanent link to an event.
 *
 * It resolves the token, selects that event, and hands over to its dashboard.
 * The resolve is public, because a share link that needs an account is not a
 * share link; what the visitor can then see is still decided page by page by
 * the admin's visibility settings.
 *
 * It redirects to the path form rather than staying here, so the address bar
 * ends up somewhere that survives a refresh and can be bookmarked.
 */
export function ShareLinkPage() {
  const { token = "" } = useParams();
  const { setSelectedEventId } = useEventContext();

  const { data, error, isLoading } = useQuery({
    queryKey: ["share-link", token],
    enabled: Boolean(token),
    retry: false,
    queryFn: () =>
      apiFetch<{ eventId: string; eventName: string }>(
        `/api/events?resource=share&token=${encodeURIComponent(token)}`,
        { requireAuth: false },
      ),
  });

  // Selecting also persists it, which is what makes the event survive a
  // refresh on any page afterwards.
  useEffect(() => {
    if (data?.eventId) setSelectedEventId(data.eventId);
  }, [data?.eventId, setSelectedEventId]);

  if (data?.eventId) return <Navigate to={`/e/${data.eventId}/dashboard`} replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-5 text-center">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Opening the event...</p>
        ) : (
          <>
            <p className="text-sm font-medium">This link did not open anything</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "That link does not match any event."} Ask whoever shared it
              for an up-to-date one - a committee can replace a link, which retires the old one.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
