import { lazy, Suspense, useEffect } from "react";
import { useSession } from "@/lib/auth";
import { isNotFound, usePlatformSession } from "./platform-api";
import { PlatformBlank, PlatformNotFound, PlatformRetry } from "./platform-not-found";

/**
 * `/platform/analytics/*` - the door to the owner-only Platform Control Center.
 *
 * Nothing in Sympal Events links here; it is reached by typing the address. That is a convenience, not the
 * protection: the protection is the server, which answers every platform request with a 404 unless the caller's
 * `app_users.id` is in `PLATFORM_ADMIN_USER_IDS` (api/_lib/platform.ts).
 *
 * This gate is the only part in the main bundle. It asks the server who is looking and draws "Page not found" for
 * anybody it refuses, signed in or not. Only an allowed owner causes the Control Center chunk to be downloaded,
 * so residents never receive its code.
 */

const PlatformApp = lazy(() => import("./platform-app").then((module) => ({ default: module.PlatformApp })));

export function PlatformGate() {
  const { data: session, isLoading: sessionLoading } = useSession();
  const access = usePlatformSession(Boolean(session));

  // Keep the area out of search engines even if a link to it ever escapes.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (sessionLoading) return <PlatformBlank />;
  if (!session) return <PlatformNotFound />;
  if (access.isPending) return <PlatformBlank />;
  // A 404 is the server's answer: not allowed. Strangers only ever get that, because the check runs first.
  if (isNotFound(access.error)) return <PlatformNotFound />;
  // Anything else is the network or a fault after the check passed - only worth a neutral retry, which says
  // nothing about what is here.
  if (access.isError) return <PlatformRetry retrying={access.isFetching} onRetry={() => void access.refetch()} />;

  return (
    <Suspense fallback={<PlatformBlank />}>
      <PlatformApp session={access.data} />
    </Suspense>
  );
}
