import type { UseQueryResult } from "@tanstack/react-query";
import { CircleDashed, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isNotFound } from "./platform-api";

/**
 * The four states every data surface in the Control Center has (UI rules §3), plus a fifth this area needs:
 * "unavailable", for data the platform does not record yet. Unavailable is not empty and not zero - it says what
 * is missing and what would make it available.
 */

/** A shaped placeholder. Pulses; the global reduced-motion block stills it. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded-md bg-muted", className)} />;
}

export function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      <span className="min-w-0">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 font-medium hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} aria-hidden="true" />
          {retrying ? "Trying again" : "Try again"}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-6 text-sm">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function UnavailableState({ title, reason, className }: { title: string; reason: string; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm", className)}>
      <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-muted-foreground">{reason}</p>
      </div>
    </div>
  );
}

/**
 * Draws a query's states. Loading shows the skeleton it is given (the shape of what is coming, never a zero);
 * an error is shown in place with a retry that refetches this query; `isEmpty` decides when loaded data counts as
 * empty. `notFound` replaces the retry for a 404 - a record that is not there, where trying again cannot help.
 */
export function QueryState<T>({
  query,
  skeleton,
  isEmpty,
  empty,
  errorMessage = "This could not be loaded.",
  notFound,
  children,
}: {
  query: UseQueryResult<T, unknown>;
  skeleton: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  errorMessage?: string;
  notFound?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{skeleton}</>;
  if (query.isError && notFound && isNotFound(query.error)) return <>{notFound}</>;
  if (query.isError) {
    const detail = query.error instanceof Error && query.error.message ? ` ${query.error.message}` : "";
    return <ErrorState message={`${errorMessage}${detail}`} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Nothing recorded yet." />}</>;
  return <>{children(query.data)}</>;
}
