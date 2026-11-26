import type { Driver } from "./DriverContext";

/** Active column sort. `null` keeps the filtered list in its original order. */
export interface DriverSort {
  key: string;
  direction: "asc" | "desc";
}

/**
 * Same comparator `Table` uses when it sorts its own rows: numbers numerically,
 * everything else with `localeCompare`, nulls last in both directions.
 */
function compareCells(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Search, team, and status filters. `"all"` leaves that dimension open. */
export function filterDrivers(
  drivers: readonly Driver[],
  search: string,
  teamFilter: string,
  statusFilter: string
): Driver[] {
  return drivers.filter((d) => {
    const matchesSearch =
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      String(d.number).includes(search);
    const matchesTeam = teamFilter === "all" || d.team === teamFilter;
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesTeam && matchesStatus;
  });
}

/** Sort a copy of `drivers`. Does not mutate the input. */
export function sortDrivers(drivers: readonly Driver[], sort: DriverSort | null): Driver[] {
  if (!sort) return [...drivers];
  const { key, direction } = sort;
  return [...drivers].sort((a, b) => {
    const cmp = compareCells(
      (a as unknown as Record<string, unknown>)[key],
      (b as unknown as Record<string, unknown>)[key]
    );
    return direction === "asc" ? cmp : -cmp;
  });
}

/** 1-indexed page slice. `safePage` clamps to the last page when `page` is past the end. */
export function paginateDrivers<T>(
  rows: readonly T[],
  page: number,
  pageSize: number
): { rows: T[]; safePage: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), safePage, totalPages };
}
