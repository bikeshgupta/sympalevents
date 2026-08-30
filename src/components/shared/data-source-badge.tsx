import { Check } from "lucide-react";
import { DataSource } from "@/lib/event-data";

export function DataSourceBadge({ source, reason }: { source?: DataSource; reason?: string }) {
  const isLive = source === "supabase";
  if (isLive) return null;

  const label = `Demo fallback${reason ? `: ${reason}` : ""}`;

  return (
    <span
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700"
    >
      <Check className="h-4 w-4" />
    </span>
  );
}
