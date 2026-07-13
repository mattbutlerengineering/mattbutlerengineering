import React, { forwardRef, isValidElement, useCallback, useState, type ReactNode } from "react";
import { cn } from "../../utils/class-composer";
import { Checkbox } from "../Checkbox/Checkbox";
import styles from "./DataTable.module.css";

/* ── Types ───────────────────────────────────── */
export type SortDirection = "asc" | "desc";
type Alignment = "left" | "center" | "right";
type SelectionMode = "single" | "multiple";
type RowKey = string | number;

/** The active sort: which column `key`, and the `direction`. `null` means unsorted. */
export interface SortState {
  key: string;
  direction: SortDirection;
}

/**
 * Defines a single column in a `DataTable`. When `render` is omitted the column
 * uses `key` as a property accessor on the row. Mark exactly one column with
 * `rowHeader` to expose it as the row's `rowheader` cell for grid semantics.
 *
 * @example
 * const col: DataTableColumn<{ name: string }> = {
 *   key: "name",
 *   header: "Driver",
 *   sortable: true,
 *   rowHeader: true,
 * };
 */
interface DataTableColumn<T> {
  /** Unique column key — also the property accessor when `render` is omitted. */
  key: string;
  /** Column header label. */
  header: string;
  /** Enable sort cycling (asc → desc → none) on this column. */
  sortable?: boolean;
  /** Cell alignment. */
  align?: Alignment;
  /** Custom cell renderer — receives the row data. */
  render?: (row: T) => ReactNode;
  /** Width hint (CSS value). */
  width?: string;
  /** Render this column's cells as `rowheader` (th scope=row) rather than `gridcell`. */
  rowHeader?: boolean;
}

/**
 * A sortable, selectable data grid built on a native `<table>` with `role="grid"`
 * and correct `columnheader`/`rowheader`/`gridcell` semantics. Sorting cycles
 * asc → desc → none with `aria-sort` on the active header. Row selection (single
 * or multiple) renders accessible checkboxes plus an indeterminate select-all.
 * Both sort and selection are controllable (value + change handler) and
 * uncontrolled-friendly (internal defaults). Row rendering is data-driven and
 * key-stable, keeping the surface ready for future virtualization.
 *
 * @example Uncontrolled
 * <DataTable
 *   columns={[
 *     { key: "name", header: "Driver", sortable: true, rowHeader: true },
 *     { key: "points", header: "Points", sortable: true, align: "right" },
 *   ]}
 *   data={drivers}
 *   rowKey={(row) => row.name}
 *   selectionMode="multiple"
 *   label="Drivers"
 * />
 */
interface DataTablePropsGeneric<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Unique key extractor per row. */
  rowKey: (row: T) => RowKey;
  /** Row density. */
  density?: "compact" | "default" | "spacious";
  /** Alternating row tints. */
  striped?: boolean;
  /** Message when data is empty. */
  emptyMessage?: string;
  className?: string;
  /** Accessible name for the grid. */
  label?: string;
  /** Controlled sort state — pass `null` for unsorted. */
  sort?: SortState | null;
  /** Initial sort state for uncontrolled use. */
  defaultSort?: SortState | null;
  /** Fires with the next sort state (`null` when a column cycles back to none). */
  onSortChange?: (sort: SortState | null) => void;
  /** Enables the leading selection column with per-row checkboxes. */
  selectionMode?: SelectionMode;
  /** Controlled selected row keys. */
  selectedKeys?: RowKey[];
  /** Initial selection for uncontrolled use. */
  defaultSelectedKeys?: RowKey[];
  /** Fires with the next selected keys. */
  onSelectionChange?: (keys: RowKey[]) => void;
  /** Accessible label for a row's selection checkbox. Defaults to "Select row". */
  selectionLabel?: (row: T) => string;
}

/** Registry documentation type — concrete version of DataTableProps for AI tooling. */
export interface DataTableProps {
  columns: unknown[];
  data: unknown[];
  rowKey: (row: unknown) => RowKey;
  density?: "compact" | "default" | "spacious";
  striped?: boolean;
  emptyMessage?: string;
  className?: string;
  label?: string;
  selectionMode?: SelectionMode;
}

/* ── Pure helpers ────────────────────────────── */

/** Cycle a column's sort: none/other → asc → desc → none. */
function nextSort(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

/** Null-safe comparator: numbers numerically, everything else by locale string. */
function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Return a sorted copy of `rows`, or the original when unsorted. */
function sortRows<T extends Record<string, unknown>>(rows: T[], sort: SortState | null): T[] {
  if (!sort) return rows;
  const { key, direction } = sort;
  return [...rows].sort((a, b) => {
    const cmp = compareValues(a[key], b[key]);
    return direction === "asc" ? cmp : -cmp;
  });
}

/** Coerce an unknown cell value into a renderable node without asserting a shape. */
function toCellNode(value: unknown): ReactNode {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "object" && isValidElement(value)) return value;
  return String(value);
}

const ariaSortFor = (
  sortable: boolean | undefined,
  active: boolean,
  direction: SortDirection
): React.AriaAttributes["aria-sort"] => {
  if (!sortable) return undefined;
  if (!active) return "none";
  return direction === "asc" ? "ascending" : "descending";
};

const alignClassFor = (align?: Alignment): string => {
  if (align === "right") return styles.alignRight ?? "";
  if (align === "center") return styles.alignCenter ?? "";
  return "";
};

/* ── Controllable state ──────────────────────── */

/**
 * Controlled-or-uncontrolled state. When `controlled` is defined the value is
 * driven by the parent; otherwise it falls back to internal state seeded from
 * `fallback`. `onChange` always fires so controlled parents can react.
 */
function useControllable<V>(
  controlled: V | undefined,
  fallback: V,
  onChange?: (value: V) => void
): readonly [V, (next: V) => void] {
  const [internal, setInternal] = useState<V>(fallback);
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : internal;
  const setValue = useCallback(
    (next: V) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange]
  );
  return [value, setValue];
}

/* ── Sort icon ───────────────────────────────── */
function SortArrow({ direction }: { direction: SortDirection | null }) {
  const base = { width: "10", height: "10", viewBox: "0 0 10 10", fill: "none" } as const;
  if (!direction) {
    return (
      <svg {...base} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M3 4L5 2L7 4" />
        <path d="M3 6L5 8L7 6" />
      </svg>
    );
  }
  return (
    <svg {...base} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {direction === "asc" ? <path d="M3 6L5 3L7 6" /> : <path d="M3 4L5 7L7 4" />}
    </svg>
  );
}

/* ── Header cell ─────────────────────────────── */
interface HeaderCellProps {
  header: string;
  sortable?: boolean;
  align?: Alignment;
  width?: string;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
}

function HeaderCell({
  header,
  sortable,
  align,
  width,
  active,
  direction,
  onSort,
}: HeaderCellProps) {
  return (
    <th
      scope="col"
      role="columnheader"
      className={cn(
        styles.th,
        alignClassFor(align),
        sortable && styles.sortable,
        active && styles.sortActive
      )}
      style={width ? { width } : undefined}
      aria-sort={ariaSortFor(sortable, active, direction)}
    >
      {sortable ? (
        <button type="button" className={styles.sortButton} onClick={onSort}>
          {header}
          <span className={styles.sortIcon} aria-hidden="true">
            <SortArrow direction={active ? direction : null} />
          </span>
        </button>
      ) : (
        header
      )}
    </th>
  );
}

/* ── Selection header cell ───────────────────── */
interface SelectionHeaderProps {
  mode: SelectionMode;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (checked: boolean) => void;
}

function SelectionHeader({ mode, allSelected, someSelected, onToggleAll }: SelectionHeaderProps) {
  return (
    <th scope="col" role="columnheader" className={cn(styles.th, styles.selectCell)}>
      {mode === "multiple" ? (
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={onToggleAll}
          label={<span className={styles.srOnly}>Select all rows</span>}
        />
      ) : (
        <span className={styles.srOnly}>Select</span>
      )}
    </th>
  );
}

/* ── Component ───────────────────────────────── */
function DataTableInner<T extends Record<string, unknown>>(
  {
    columns,
    data,
    rowKey,
    density = "default",
    striped = false,
    emptyMessage = "No data",
    className = "",
    label,
    sort: sortProp,
    defaultSort = null,
    onSortChange,
    selectionMode,
    selectedKeys: selectedKeysProp,
    defaultSelectedKeys = [],
    onSelectionChange,
    selectionLabel,
  }: DataTablePropsGeneric<T>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const [sort, setSort] = useControllable<SortState | null>(sortProp, defaultSort, onSortChange);
  const [selected, setSelected] = useControllable<RowKey[]>(
    selectedKeysProp,
    defaultSelectedKeys,
    onSelectionChange
  );

  const hasSelection = selectionMode !== undefined;
  const selectedSet = new Set(selected);
  const allKeys = data.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedSet.has(k));
  const someSelected = allKeys.some((k) => selectedSet.has(k));

  const toggleRow = useCallback(
    (key: RowKey) => {
      const isOn = selected.includes(key);
      if (selectionMode === "single") {
        setSelected(isOn ? [] : [key]);
        return;
      }
      setSelected(isOn ? selected.filter((k) => k !== key) : [...selected, key]);
    },
    [selectionMode, selected, setSelected]
  );

  const toggleAll = useCallback(
    (checked: boolean) => setSelected(checked ? allKeys : []),
    [allKeys, setSelected]
  );

  const sortedData = sortRows(data, sort);
  const densityClass = density !== "default" ? styles[density] : "";
  const totalCols = columns.length + (hasSelection ? 1 : 0);

  return (
    <div ref={ref} className={cn(styles.wrapper, className)}>
      <table
        className={cn(styles.table, densityClass)}
        role="grid"
        aria-label={label}
        aria-multiselectable={selectionMode === "multiple" || undefined}
      >
        <thead className={styles.thead}>
          <tr role="row">
            {hasSelection && (
              <SelectionHeader
                mode={selectionMode}
                allSelected={allSelected}
                someSelected={someSelected}
                onToggleAll={toggleAll}
              />
            )}
            {columns.map((col) => (
              <HeaderCell
                key={col.key}
                header={col.header}
                sortable={col.sortable}
                align={col.align}
                width={col.width}
                active={sort?.key === col.key}
                direction={sort?.key === col.key ? sort.direction : "asc"}
                onSort={() => setSort(nextSort(sort, col.key))}
              />
            ))}
          </tr>
        </thead>
        <tbody className={striped ? styles.striped : undefined}>
          {sortedData.length === 0 ? (
            <tr role="row">
              <td role="gridcell" colSpan={totalCols} className={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row) => {
              const key = rowKey(row);
              const isSelected = selectedSet.has(key);
              return (
                <tr
                  key={key}
                  role="row"
                  className={styles.tr}
                  aria-selected={hasSelection ? isSelected : undefined}
                >
                  {hasSelection && (
                    <td role="gridcell" className={styles.selectCell}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(key)}
                        label={
                          <span className={styles.srOnly}>
                            {selectionLabel ? selectionLabel(row) : "Select row"}
                          </span>
                        }
                      />
                    </td>
                  )}
                  {columns.map((col) => {
                    const content = col.render ? col.render(row) : toCellNode(row[col.key]);
                    if (col.rowHeader) {
                      return (
                        <th
                          key={col.key}
                          scope="row"
                          role="rowheader"
                          className={cn(styles.td, styles.rowHeader, alignClassFor(col.align))}
                        >
                          {content}
                        </th>
                      );
                    }
                    return (
                      <td
                        key={col.key}
                        role="gridcell"
                        className={cn(styles.td, alignClassFor(col.align))}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export const DataTable = forwardRef(DataTableInner) as <T extends Record<string, unknown>>(
  props: DataTablePropsGeneric<T> & { ref?: React.Ref<HTMLDivElement> }
) => React.ReactElement | null;
(DataTable as { displayName?: string }).displayName = "DataTable";
