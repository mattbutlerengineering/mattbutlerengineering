import React, { forwardRef, useState, useCallback, type ReactNode } from "react";
import styles from "./Table.module.css";

/* ── Types ───────────────────────────────────── */
type SortDirection = "asc" | "desc";
type Alignment = "left" | "center" | "right";

/**
 * Defines a single column in a `Table`, including its header, alignment, sort behavior, and optional custom renderer.
 * When `render` is omitted, the column uses `key` as a property accessor on the row object.
 *
 * @example
 * const col: Column<{ name: string }> = {
 *   key: "name",
 *   header: "Driver",
 *   sortable: true,
 * };
 */
interface Column<T> {
  /** Unique column key — also used as the property accessor if `render` is omitted */
  key: string;
  /** Column header label */
  header: string;
  /** Enable sorting on this column */
  sortable?: boolean;
  /** Cell alignment */
  align?: Alignment;
  /** Custom cell renderer — receives the row data */
  render?: (row: T) => ReactNode;
  /** Width hint (CSS value) */
  width?: string;
}

/**
 * A data table with built-in column sorting, row striping, and density control.
 * Sorting is handled internally -- click a sortable column header to cycle asc/desc.
 *
 * @example
 * <Table<{ name: string; time: number }>
 *   columns={[
 *     { key: "name", header: "Driver", sortable: true },
 *     { key: "time", header: "Lap Time", sortable: true },
 *   ]}
 *   data={drivers}
 *   rowKey={(row) => row.name}
 * />
 */
interface TablePropsGeneric<T> {
  columns: Column<T>[];
  data: T[];
  /** Unique key extractor per row */
  rowKey: (row: T) => string | number;
  /** Row density */
  density?: "compact" | "default" | "spacious";
  /** Alternating row tints */
  striped?: boolean;
  /** Message when data is empty */
  emptyMessage?: string;
  className?: string;
}

/** Registry documentation type -- concrete version of TableProps for AI tooling */
export interface TableProps {
  columns: Column<unknown>[];
  data: unknown[];
  rowKey: (row: unknown) => string | number;
  density?: "compact" | "default" | "spacious";
  striped?: boolean;
  emptyMessage?: string;
  className?: string;
}

/* ── Sort icon ──────────────────────────────── */
function SortArrow({ direction }: { direction: SortDirection | null }) {
  if (!direction) {
    // Neutral sort indicator
    return (
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      >
        <path d="M3 4L5 2L7 4" />
        <path d="M3 6L5 8L7 6" />
      </svg>
    );
  }

  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      {direction === "asc" ? <path d="M3 6L5 3L7 6" /> : <path d="M3 4L5 7L7 4" />}
    </svg>
  );
}

/* ── Component ──────────────────────────────── */
function TableInner<T extends Record<string, unknown>>(
  {
    columns,
    data,
    rowKey,
    density = "default",
    striped = false,
    emptyMessage = "No data",
    className = "",
  }: TablePropsGeneric<T>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  // Sort data
  const sortedData = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        let cmp: number;
        if (typeof aVal === "number" && typeof bVal === "number") {
          cmp = aVal - bVal;
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  const densityClass = density !== "default" ? styles[density] : "";
  const tbodyClass = striped ? styles.striped : "";

  const alignClass = (align?: Alignment) => {
    if (align === "right") return styles.alignRight;
    if (align === "center") return styles.alignCenter;
    return "";
  };

  return (
    <div ref={ref} className={`${styles.wrapper} ${className}`}>
      <table className={`${styles.table} ${densityClass}`}>
        <thead className={styles.thead}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${styles.th} ${col.sortable ? styles.sortable : ""} ${sortKey === col.key ? styles.sortActive : ""} ${alignClass(col.align)}`}
                style={col.width ? { width: col.width } : undefined}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                onKeyDown={
                  col.sortable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSort(col.key);
                        }
                      }
                    : undefined
                }
                tabIndex={col.sortable ? 0 : undefined}
                aria-sort={
                  sortKey === col.key
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : col.sortable
                      ? "none"
                      : undefined
                }
                role={col.sortable ? "columnheader" : undefined}
              >
                {col.header}
                {col.sortable && (
                  <span className={styles.sortIcon}>
                    <SortArrow direction={sortKey === col.key ? sortDir : null} />
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={tbodyClass}>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => (
              <tr key={rowKey(row)} className={styles.tr}>
                {columns.map((col) => (
                  <td key={col.key} className={`${styles.td} ${alignClass(col.align)}`}>
                    {col.render ? col.render(row) : (row[col.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export const Table = forwardRef(TableInner) as <T extends Record<string, unknown>>(
  props: TablePropsGeneric<T> & { ref?: React.Ref<HTMLDivElement> }
) => React.ReactElement | null;
(Table as { displayName?: string }).displayName = "Table";
