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
}: {
  action: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
}) {
  const showSearch = typeof onSearchChange === "function";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {showSearch ? (
        <div className="relative w-full sm:max-w-xs">
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
      {action}
    </div>
  );
}
