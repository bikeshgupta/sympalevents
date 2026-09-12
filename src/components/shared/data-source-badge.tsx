import { Loader2, TriangleAlert } from "lucide-react";
import { DataSource } from "@/lib/event-data";

export function DataSourceBadge({
  source,
  reason,
  isLoading = false,
}: {
  source?: DataSource;
  reason?: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
        <span className="hidden sm:inline">Loading</span>
        <span className="sr-only">Loading live data</span>
      </span>
    );
  }

  if (source === "supabase") return null;

  const label = `Showing demo data${reason ? `: ${reason}` : ". Live data is unavailable."}`;

  return (
    <span
      role="status"
      title={label}
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">Demo data</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
