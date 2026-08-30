import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  Received: "bg-emerald-100 text-emerald-800",
  Confirmed: "bg-teal-100 text-teal-800",
  "Partially Paid": "bg-amber-100 text-amber-800",
  Pending: "bg-slate-100 text-slate-700",
  "Not Started": "bg-slate-100 text-slate-700",
  "In Progress": "bg-sky-100 text-sky-800",
  Blocked: "bg-rose-100 text-rose-800",
  Completed: "bg-emerald-100 text-emerald-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", statusStyles[status] ?? "bg-muted")}>
      {status}
    </span>
  );
}
