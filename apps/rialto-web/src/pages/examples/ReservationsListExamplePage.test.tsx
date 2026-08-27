import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  ReservationsListExamplePage,
  RESERVATIONS,
  PAGE_SIZE,
  filterBySearch,
  filterByStatus,
  sortReservations,
  paginate,
} from "./ReservationsListExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. These stubs are *behavioral*: they faithfully
// emit the same callbacks the real components emit (DataTable header sort,
// per-row + select-all selection, Pagination page change, Select onChange),
// so the page's real search/filter/sort/pagination/selection logic is what the
// assertions exercise. They do NOT reimplement that logic.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  type SortState = { key: string; direction: "asc" | "desc" } | null;
  // Mirror of the real DataTable sort cycle: none/other -> asc -> desc -> none.
  const nextSort = (current: SortState, key: string): SortState => {
    if (!current || current.key !== key) return { key, direction: "asc" };
    if (current.direction === "asc") return { key, direction: "desc" };
    return null;
  };
  const toggle = (keys: (string | number)[], key: string | number) =>
    keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];

  const DataTable = ({
    columns,
    data,
    rowKey,
    selectionMode,
    selectedKeys = [],
    onSelectionChange,
    sort = null,
    onSortChange,
    emptyMessage = "No data",
    label,
    selectionLabel,
  }: {
    columns: {
      key: string;
      header: string;
      sortable?: boolean;
      render?: (row: Record<string, unknown>) => ReactNode;
    }[];
    data: Record<string, unknown>[];
    rowKey: (row: Record<string, unknown>) => string | number;
    selectionMode?: "single" | "multiple";
    selectedKeys?: (string | number)[];
    onSelectionChange?: (keys: (string | number)[]) => void;
    sort?: SortState;
    onSortChange?: (sort: SortState) => void;
    emptyMessage?: string;
    label?: string;
    selectionLabel?: (row: Record<string, unknown>) => string;
  }) => {
    const allKeys = data.map(rowKey);
    const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.includes(k));
    return (
      <table aria-label={label}>
        <thead>
          <tr>
            {selectionMode && (
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  onChange={(e) => onSelectionChange?.(e.target.checked ? allKeys : [])}
                />
              </th>
            )}
            {columns.map((col) =>
              col.sortable ? (
                <th key={col.key}>
                  <button type="button" onClick={() => onSortChange?.(nextSort(sort, col.key))}>
                    {col.header}
                  </button>
                </th>
              ) : (
                <th key={col.key}>{col.header}</th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td>{emptyMessage}</td>
            </tr>
          ) : (
            data.map((row) => {
              const key = rowKey(row);
              return (
                <tr key={key} data-testid="reservations-row" data-row={String(key)}>
                  {selectionMode && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={selectionLabel ? selectionLabel(row) : "Select row"}
                        checked={selectedKeys.includes(key)}
                        onChange={() => onSelectionChange?.(toggle(selectedKeys, key))}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    );
  };

  const Select = ({
    label,
    options,
    value,
    onChange,
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <select aria-label={label} value={value} onChange={(e) => onChange?.(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const Input = ({
    label,
    startIcon: _startIcon,
    endIcon: _endIcon,
    hint: _hint,
    error: _error,
    showOptional: _showOptional,
    disabledReason: _disabledReason,
    ...rest
  }: {
    label?: string;
    startIcon?: ReactNode;
    endIcon?: ReactNode;
    hint?: string;
    error?: boolean;
    showOptional?: boolean;
    disabledReason?: string;
    [key: string]: unknown;
  }) => <input aria-label={label} {...rest} />;

  const Button = ({
    children,
    isLoading: _isLoading,
    loadingText: _loadingText,
    variant: _variant,
    size: _size,
    ...rest
  }: {
    children?: ReactNode;
    isLoading?: boolean;
    loadingText?: string;
    variant?: string;
    size?: string;
    [key: string]: unknown;
  }) => <button {...rest}>{children}</button>;

  const EmptyState = ({
    heading,
    description,
    action,
  }: {
    heading?: string;
    description?: string;
    action?: ReactNode;
  }) => (
    <div data-testid="empty-state">
      <h2>{heading}</h2>
      <p>{description}</p>
      {action}
    </div>
  );

  const Pagination = ({
    page,
    totalPages,
    onChange,
  }: {
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
  }) => (
    <nav aria-label="pagination">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          type="button"
          aria-label={`Page ${p}`}
          aria-current={p === page ? "page" : undefined}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
    </nav>
  );

  return {
    DataTable,
    Select,
    Input,
    Button,
    EmptyState,
    Pagination,
    Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    Skeleton: () => <div data-testid="skeleton" />,
    SkeletonGroup: ({ children }: { children?: ReactNode }) => (
      <div data-testid="skeleton-group">{children}</div>
    ),
    Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    Divider: () => <hr />,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(<ReservationsListExamplePage />);
}

/** Reservation ids of the currently visible table rows, in render order. */
function visibleRowIds(): string[] {
  return screen.queryAllByTestId("reservations-row").map((tr) => tr.getAttribute("data-row") ?? "");
}

// ---------------------------------------------------------------------------
// Pure logic — no components involved
// ---------------------------------------------------------------------------

describe("ReservationsListExamplePage — pure helpers", () => {
  it("provides a fixture large enough to paginate", () => {
    expect(RESERVATIONS.length).toBeGreaterThan(PAGE_SIZE);
    expect(new Set(RESERVATIONS.map((r) => r.id)).size).toBe(RESERVATIONS.length);
  });

  it("filterBySearch matches guest, id, and room case-insensitively", () => {
    const target = RESERVATIONS[0]!;
    const byGuest = filterBySearch(RESERVATIONS, target.guest.toUpperCase());
    expect(byGuest.some((r) => r.id === target.id)).toBe(true);
    expect(filterBySearch(RESERVATIONS, target.id.toLowerCase())).toContainEqual(target);
    expect(filterBySearch(RESERVATIONS, "zzzz-no-match")).toHaveLength(0);
    expect(filterBySearch(RESERVATIONS, "")).toHaveLength(RESERVATIONS.length);
  });

  it("filterByStatus subsets to one status and passes 'all' through", () => {
    const cancelled = filterByStatus(RESERVATIONS, "cancelled");
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every((r) => r.status === "cancelled")).toBe(true);
    expect(filterByStatus(RESERVATIONS, "all")).toHaveLength(RESERVATIONS.length);
  });

  it("sortReservations returns a new sorted array without mutating input", () => {
    const original = [...RESERVATIONS];
    const asc = sortReservations(RESERVATIONS, { key: "nights", direction: "asc" });
    const desc = sortReservations(RESERVATIONS, { key: "nights", direction: "desc" });
    expect(RESERVATIONS).toEqual(original); // input untouched
    const ascNights = asc.map((r) => r.nights);
    expect([...ascNights].sort((a, b) => a - b)).toEqual(ascNights);
    expect(desc.map((r) => r.nights)).toEqual([...ascNights].reverse());
    expect(sortReservations(RESERVATIONS, null)).toEqual(RESERVATIONS);
  });

  it("paginate slices the requested 1-indexed page", () => {
    expect(paginate(RESERVATIONS, 1, PAGE_SIZE)).toEqual(RESERVATIONS.slice(0, PAGE_SIZE));
    expect(paginate(RESERVATIONS, 2, PAGE_SIZE)).toEqual(
      RESERVATIONS.slice(PAGE_SIZE, PAGE_SIZE * 2)
    );
  });
});

// ---------------------------------------------------------------------------
// Composition — page wiring through behavioral component stubs
// ---------------------------------------------------------------------------

describe("ReservationsListExamplePage — composition", () => {
  it("renders the first page of reservations by default", () => {
    renderPage();
    const ids = visibleRowIds();
    expect(ids).toHaveLength(PAGE_SIZE);
    expect(ids).toEqual(RESERVATIONS.slice(0, PAGE_SIZE).map((r) => r.id));
  });

  it("searching narrows the visible rows", () => {
    renderPage();
    const target = RESERVATIONS[10]!;
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: target.guest } });
    const ids = visibleRowIds();
    expect(ids).toContain(target.id);
    expect(ids.length).toBeLessThan(PAGE_SIZE);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("a search with no matches surfaces the empty state", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/search/i), {
      target: { value: "no-such-guest-zzzz" },
    });
    expect(visibleRowIds()).toHaveLength(0);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("filtering by status subsets to exactly the matching reservations", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/filter by status/i), {
      target: { value: "cancelled" },
    });
    const expected = RESERVATIONS.filter((r) => r.status === "cancelled").map((r) => r.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(new Set(visibleRowIds())).toEqual(new Set(expected));
  });

  // Sort + re-render of the full page is the most expensive interaction in this
  // file (locally ~4-7x its sibling composition tests) — under CI's cold,
  // fully-parallel load that's enough to occasionally trip vitest's 5000ms
  // default (see .claude/rules/gotchas.md § CI, the buildApp() cold-start
  // pattern). The click handler chain here is entirely synchronous (mock
  // DataTable calls onSortChange synchronously, handleSort's setSort/setPage
  // flush within fireEvent's act()), so there's no pending async work for a
  // waitFor/findBy* query to await — a longer per-test timeout is the correct
  // fix, not a race to poll for.
  it("clicking a sortable column header reorders the rows", { timeout: 15000 }, () => {
    renderPage();
    const before = visibleRowIds();
    fireEvent.click(screen.getByRole("button", { name: "Nights" }));
    const after = visibleRowIds();
    const expected = [...RESERVATIONS]
      .sort((a, b) => a.nights - b.nights)
      .slice(0, PAGE_SIZE)
      .map((r) => r.id);
    expect(after).toEqual(expected);
    expect(after).not.toEqual(before);
  });

  it("pagination changes the visible page", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(visibleRowIds()).toEqual(RESERVATIONS.slice(PAGE_SIZE, PAGE_SIZE * 2).map((r) => r.id));
  });

  it("selecting rows reveals a bulk-action bar with the selected count", () => {
    renderPage();
    expect(screen.queryByRole("region", { name: /bulk actions/i })).not.toBeInTheDocument();

    const firstGuest = RESERVATIONS[0]!.guest;
    fireEvent.click(screen.getByLabelText(new RegExp(`select ${firstGuest}`, "i")));

    const bar = screen.getByRole("region", { name: /bulk actions/i });
    expect(within(bar).getByText(/1 selected/i)).toBeInTheDocument();

    // Clearing hides the bar again.
    fireEvent.click(within(bar).getByRole("button", { name: /clear selection/i }));
    expect(screen.queryByRole("region", { name: /bulk actions/i })).not.toBeInTheDocument();
  });

  it("select-all selects the whole visible page and the bar reflects it", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText(/select all rows/i));
    const bar = screen.getByRole("region", { name: /bulk actions/i });
    expect(within(bar).getByText(new RegExp(`${PAGE_SIZE} selected`, "i"))).toBeInTheDocument();
  });

  it("exposes per-row actions", () => {
    renderPage();
    const firstGuest = RESERVATIONS[0]!.guest;
    expect(
      screen.getByRole("button", { name: new RegExp(`cancel ${firstGuest}`, "i") })
    ).toBeInTheDocument();
  });

  it("view-state control can reach the loading state", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/view state/i), { target: { value: "loading" } });
    expect(screen.getByTestId("skeleton-group")).toBeInTheDocument();
    expect(screen.queryAllByTestId("reservations-row")).toHaveLength(0);
  });

  it("view-state control can reach the empty state", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/view state/i), { target: { value: "empty" } });
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.queryAllByTestId("reservations-row")).toHaveLength(0);
  });
});
