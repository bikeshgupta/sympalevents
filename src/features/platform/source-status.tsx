import { cn } from "@/lib/utils";
import type { SourceStatus } from "./platform-api";

/**
 * How a data source is described everywhere in the Control Center: a dot and a word (never colour alone), then
 * what it holds. "Missing" names the database update that would add it; it is never shown as zero.
 */

const statusWords: Record<SourceStatus, string> = {
  available: "Available",
  missing: "Not in the database yet",
  error: "Could not be read",
};

export function StatusDot({ status }: { status: SourceStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        status === "available" && "bg-primary",
        status === "missing" && "border border-dashed border-muted-foreground",
        status === "error" && "bg-destructive",
      )}
    />
  );
}

export function SourceStatusLabel({ status, label }: { status: SourceStatus; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <StatusDot status={status} />
      <span className={cn(status === "error" && "text-destructive")}>{label ?? statusWords[status]}</span>
    </span>
  );
}
