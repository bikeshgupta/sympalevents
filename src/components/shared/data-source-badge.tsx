import { DataSource } from "@/lib/event-data";

export function DataSourceBadge({ source }: { source?: DataSource }) {
  const isLive = source === "supabase";

  return (
    <span className={isLive ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800" : "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"}>
      {isLive ? "Supabase data" : "Demo fallback"}
    </span>
  );
}
