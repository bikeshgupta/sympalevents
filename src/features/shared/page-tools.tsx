import { Search, X } from "lucide-react";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PageTools({
  action,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search",
  searchLabel = "Search records",
  inline = false,
}: {
  action: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  /**
   * Opt-in: keep the search box and the action on one row on a phone too,
   * instead of stacking them. Off by default - every other screen keeps the
   * stacked layout it has today; only a screen whose whole point is fitting
   * many rows on one screen buys the row back.
   */
  inline?: boolean;
}) {
  const showSearch = typeof onSearchChange === "function";

  return (
    <div
      className={
        inline
          ? "flex items-center justify-between gap-2"
          : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      {showSearch ? (
        <div className={inline ? "relative min-w-0 flex-1 sm:max-w-xs" : "relative w-full sm:max-w-xs"}>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchValue ?? ""}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="pl-9 pr-9"
          />
          {searchValue ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              onClick={() => onSearchChange?.("")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : (
        <div />
      )}
      {/* The action keeps its intrinsic width in inline mode; the search box is
          what gives, since it can shrink to nothing and still be usable. */}
      {inline ? <div className="shrink-0">{action}</div> : action}
    </div>
  );
}
