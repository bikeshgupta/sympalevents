import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SortDirection = "asc" | "desc";
export type ColumnFilters = Record<string, string>;

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

export function useFilteredSortedRows<T>(rows: T[], columns: TableColumn<T>[], defaultSortKey: string) {
  const [filters, setFilters] = useState<ColumnFilters>({});
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const sortedRows = useMemo(() => {
    const activeFilters = Object.entries(filters)
      .map(([key, value]) => [key, value.trim().toLowerCase()] as const)
      .filter(([, value]) => value);
    const activeColumn = columns.find((column) => column.key === sortKey) ?? columns[0];
    const filtered = activeFilters.length
      ? rows.filter((row) =>
          activeFilters.every(([key, filter]) => {
            const column = columns.find((item) => item.key === key);
            return String(column?.getValue(row) ?? "").toLowerCase().includes(filter);
          }),
        )
      : rows;

    return [...filtered].sort((left, right) => {
      const result = compareValues(normalize(activeColumn.getValue(left)), normalize(activeColumn.getValue(right)));
      return sortDirection === "asc" ? result : -result;
    });
  }, [columns, filters, rows, sortDirection, sortKey]);

  function setColumnFilter(columnKey: string, value: string) {
    setFilters((current) => ({
      ...current,
      [columnKey]: value,
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
  columns,
  sortKey,
  setSortKey,
  sortDirection,
  setSortDirection,
  resultCount,
  totalCount,
}: {
  columns: TableColumn<T>[];
  sortKey: string;
  setSortKey: (key: string) => void;
  sortDirection: SortDirection;
  setSortDirection: (direction: SortDirection) => void;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:justify-end">
      <span className="text-sm text-muted-foreground">
        {resultCount} of {totalCount}
      </span>
      <select
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={sortKey}
        onChange={(event) => setSortKey(event.target.value)}
      >
        {columns.map((column) => (
          <option key={column.key} value={column.key}>
            Sort by {column.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Toggle sort direction"
        onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
      >
        {sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
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
  label,
  columnKey,
  filters,
  onFilterChange,
}: {
  label: string;
  columnKey: string;
  filters: ColumnFilters;
  onFilterChange: (columnKey: string, value: string) => void;
}) {
  return (
    <Input
      value={filters[columnKey] ?? ""}
      onChange={(event) => onFilterChange(columnKey, event.target.value)}
      placeholder={label}
      aria-label={`Filter ${label}`}
      className="mt-2 h-8 min-w-24 bg-background px-2 text-xs font-normal"
    />
  );
}

export function ColumnFilterPanel<T>({
  columns,
  filters,
  onFilterChange,
}: {
  columns: TableColumn<T>[];
  filters: ColumnFilters;
  onFilterChange: (columnKey: string, value: string) => void;
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
            value={filters[column.key] ?? ""}
            onChange={(event) => onFilterChange(column.key, event.target.value)}
            className="h-9"
          />
        </div>
      ))}
    </div>
  );
}
