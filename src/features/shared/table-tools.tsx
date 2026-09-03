import { useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SortDirection = "asc" | "desc";
export type ColumnFilters = Record<string, string[]>;

export type TableColumn<T> = {
  key: string;
  label: string;
  getValue: (row: T) => string | number | boolean | null | undefined;
  /** Set false for machine-readable columns (timestamps, ids) that should not
   *  produce false hits in the free-text search. Defaults to true. */
  searchable?: boolean;
};

function normalize(value: string | number | boolean | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value ?? "").toLowerCase();
}

function compareValues(left: ReturnType<typeof normalize>, right: ReturnType<typeof normalize>) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function displayFilterValue(value: string | number | boolean | null | undefined) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value ?? "").trim();
  return text || "(Blank)";
}

export function useFilteredSortedRows<T>(
  rows: T[],
  columns: TableColumn<T>[],
  defaultSortKey: string,
  defaultSortDirection: SortDirection = "asc",
) {
  const [filters, setFilters] = useState<ColumnFilters>({});
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  const sortedRows = useMemo(() => {
    const activeFilters = Object.entries(filters)
      .map(([key, values]) => [key, new Set(values)] as const)
      .filter(([, values]) => values.size);
    const activeColumn = columns.find((column) => column.key === sortKey) ?? columns[0];
    const query = search.trim().toLowerCase();
    let filtered = activeFilters.length
      ? rows.filter((row) =>
          activeFilters.every(([key, selectedValues]) => {
            const column = columns.find((item) => item.key === key);
            return selectedValues.has(displayFilterValue(column?.getValue(row)));
          }),
        )
      : rows;

    if (query) {
      filtered = filtered.filter((row) =>
        columns.some(
          (column) =>
            column.searchable !== false &&
            String(column.getValue(row) ?? "").toLowerCase().includes(query),
        ),
      );
    }

    return [...filtered].sort((left, right) => {
      const result = compareValues(normalize(activeColumn.getValue(left)), normalize(activeColumn.getValue(right)));
      return sortDirection === "asc" ? result : -result;
    });
  }, [columns, filters, rows, search, sortDirection, sortKey]);

  const activeFilterCount = Object.values(filters).filter((values) => values.length).length;

  function setColumnFilter(columnKey: string, values: string[]) {
    setFilters((current) => ({
      ...current,
      [columnKey]: values,
    }));
  }

  function toggleSort(columnKey: string) {
    if (sortKey === columnKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(columnKey);
    setSortDirection("asc");
  }

  /** True while the table is still in the order it was given on load. */
  const isDefaultSort = sortKey === defaultSortKey && sortDirection === defaultSortDirection;

  function clearFilters() {
    setFilters({});
    setSearch("");
  }

  return {
    rows: sortedRows,
    filters,
    setColumnFilter,
    search,
    setSearch,
    activeFilterCount,
    isDefaultSort,
    hasActiveFilters: activeFilterCount > 0 || search.trim().length > 0,
    clearFilters,
    sortKey,
    setSortKey,
    sortDirection,
    setSortDirection,
    toggleSort,
  };
}

export function TableToolbar({
  resultCount,
  totalCount,
  label = "records",
  hasActiveFilters = false,
  onClearFilters,
  sortNote,
}: {
  resultCount: number;
  totalCount: number;
  label?: string;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  /** Explains a default order the column headers cannot show, e.g. "Newest first". */
  sortNote?: string;
}) {
  const isFiltered = resultCount !== totalCount;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b p-3">
      {sortNote ? (
        <span className="mr-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          {sortNote}
        </span>
      ) : null}
      {hasActiveFilters && onClearFilters ? (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onClearFilters}>
          <X className="h-3.5 w-3.5" />
          Clear filters
        </Button>
      ) : null}
      <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
        {isFiltered ? `${resultCount} of ${totalCount} ${label}` : `${totalCount} ${label}`}
      </span>
    </div>
  );
}

export function SortableHeader({
  label,
  columnKey,
  sortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  columnKey: string;
  sortKey: string;
  sortDirection: SortDirection;
  onSort: (columnKey: string) => void;
}) {
  const active = sortKey === columnKey;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium text-inherit"
      onClick={() => onSort(columnKey)}
    >
      {label}
      {active ? (
        sortDirection === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
      )}
    </button>
  );
}

export function ColumnFilter<T>({
  column,
  rows,
  filters,
  onFilterChange,
}: {
  column: TableColumn<T>;
  rows: T[];
  filters: ColumnFilters;
  onFilterChange: (columnKey: string, values: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedValues = filters[column.key] ?? [];
  const selectedSet = new Set(selectedValues);
  const options = useMemo(
    () =>
      [...new Set(rows.map((row) => displayFilterValue(column.getValue(row))))].sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [column, rows],
  );
  const visibleOptions = query.trim()
    ? options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function toggleValue(value: string) {
    const next = selectedSet.has(value)
      ? selectedValues.filter((item) => item !== value)
      : [...selectedValues, value];
    onFilterChange(column.key, next);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant={selectedValues.length ? "secondary" : "ghost"}
          size="icon"
          className="ml-1 h-7 w-7"
          aria-label={`Filter ${column.label}`}
        >
          <ListFilter className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-56 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${column.label}`}
            className="mb-2 h-8 text-xs"
          />
          <div className="max-h-56 overflow-y-auto">
            {visibleOptions.map((option) => (
              <DropdownMenu.CheckboxItem
                key={option}
                checked={selectedSet.has(option)}
                onCheckedChange={() => toggleValue(option)}
                onSelect={(event) => event.preventDefault()}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-muted"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-sm border text-[10px]">
                  {selectedSet.has(option) ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="truncate">{option}</span>
              </DropdownMenu.CheckboxItem>
            ))}
          </div>
          {selectedValues.length ? (
            <>
              <DropdownMenu.Separator className="my-2 h-px bg-border" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start"
                onClick={() => onFilterChange(column.key, [])}
              >
                Clear filter
              </Button>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ColumnFilterPanel<T>({
  columns,
  filters,
  onFilterChange,
}: {
  columns: TableColumn<T>[];
  filters: ColumnFilters;
  onFilterChange: (columnKey: string, values: string[]) => void;
}) {
  return (
    <div className="grid gap-2 border-b p-3 sm:grid-cols-2 lg:hidden">
      {columns.map((column) => (
        <div key={column.key} className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`filter-${column.key}`}>
            {column.label}
          </label>
          <Input
            id={`filter-${column.key}`}
            value={(filters[column.key] ?? []).join(", ")}
            onChange={(event) =>
              onFilterChange(column.key, event.target.value ? [event.target.value] : [])
            }
            className="h-9"
          />
        </div>
      ))}
    </div>
  );
}
