import { useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SortDirection = "asc" | "desc";
export type ColumnFilters = Record<string, string[]>;

export type TableColumn<T> = {
  key: string;
  label: string;
  getValue: (row: T) => string | number | boolean | null | undefined;
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

export function useFilteredSortedRows<T>(rows: T[], columns: TableColumn<T>[], defaultSortKey: string) {
  const [filters, setFilters] = useState<ColumnFilters>({});
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const sortedRows = useMemo(() => {
    const activeFilters = Object.entries(filters)
      .map(([key, values]) => [key, new Set(values)] as const)
      .filter(([, values]) => values.size);
    const activeColumn = columns.find((column) => column.key === sortKey) ?? columns[0];
    const filtered = activeFilters.length
      ? rows.filter((row) =>
          activeFilters.every(([key, selectedValues]) => {
            const column = columns.find((item) => item.key === key);
            return selectedValues.has(displayFilterValue(column?.getValue(row)));
          }),
        )
      : rows;

    return [...filtered].sort((left, right) => {
      const result = compareValues(normalize(activeColumn.getValue(left)), normalize(activeColumn.getValue(right)));
      return sortDirection === "asc" ? result : -result;
    });
  }, [columns, filters, rows, sortDirection, sortKey]);

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

  return {
    rows: sortedRows,
    filters,
    setColumnFilter,
    sortKey,
    setSortKey,
    sortDirection,
    setSortDirection,
    toggleSort,
  };
}

export function TableToolbar<T>({
  resultCount,
  totalCount,
}: {
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex justify-end border-b p-3">
      <span className="text-sm text-muted-foreground">
        {resultCount} of {totalCount}
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

export function ColumnFilter({
  column,
  rows,
  filters,
  onFilterChange,
}: {
  column: TableColumn<any>;
  rows: any[];
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
