import { useMemo, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  Pagination,
  Select,
  Skeleton,
  SkeletonGroup,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { SortState } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./ReservationsListExamplePage.module.css";

/* ── Domain ──────────────────────────────────── */

export type ReservationStatus = "confirmed" | "checked-in" | "pending" | "cancelled";

export interface Reservation extends Record<string, unknown> {
  id: string;
  guest: string;
  room: string;
  checkIn: string;
  nights: number;
  party: number;
  status: ReservationStatus;
}

/** Rows shown per page — small enough that the fixture spans multiple pages. */
export const PAGE_SIZE = 8;

/* ── Fixture data (no service calls) ─────────── */

export const RESERVATIONS: Reservation[] = [
  { id: "RES-1001", guest: "Elena Marchetti", room: "Suite 402", checkIn: "Mar 23", nights: 3, party: 2, status: "confirmed" },
  { id: "RES-1002", guest: "James Whitfield", room: "Deluxe 218", checkIn: "Mar 24", nights: 2, party: 1, status: "checked-in" },
  { id: "RES-1003", guest: "Amara Okonkwo", room: "Standard 115", checkIn: "Mar 25", nights: 1, party: 3, status: "pending" },
  { id: "RES-1004", guest: "Luca Ferreira", room: "Suite 510", checkIn: "Mar 26", nights: 4, party: 2, status: "confirmed" },
  { id: "RES-1005", guest: "Sophie Laurent", room: "Deluxe 307", checkIn: "Mar 27", nights: 2, party: 4, status: "cancelled" },
  { id: "RES-1006", guest: "Tariq Al-Rashid", room: "Standard 208", checkIn: "Mar 28", nights: 3, party: 2, status: "checked-in" },
  { id: "RES-1007", guest: "Mei Lin Chen", room: "Suite 401", checkIn: "Mar 29", nights: 5, party: 2, status: "confirmed" },
  { id: "RES-1008", guest: "Oliver Brandt", room: "Deluxe 220", checkIn: "Mar 30", nights: 1, party: 1, status: "pending" },
  { id: "RES-1009", guest: "Nadia Petrova", room: "Standard 118", checkIn: "Mar 31", nights: 2, party: 2, status: "confirmed" },
  { id: "RES-1010", guest: "Hiroshi Tanaka", room: "Suite 505", checkIn: "Apr 01", nights: 6, party: 3, status: "checked-in" },
  { id: "RES-1011", guest: "Priya Ananth", room: "Deluxe 312", checkIn: "Apr 02", nights: 2, party: 2, status: "confirmed" },
  { id: "RES-1012", guest: "Gabriel Moreau", room: "Standard 210", checkIn: "Apr 03", nights: 3, party: 1, status: "pending" },
  { id: "RES-1013", guest: "Isabella Rossi", room: "Suite 404", checkIn: "Apr 04", nights: 4, party: 2, status: "cancelled" },
  { id: "RES-1014", guest: "Kwame Mensah", room: "Deluxe 225", checkIn: "Apr 05", nights: 1, party: 4, status: "confirmed" },
  { id: "RES-1015", guest: "Freya Andersen", room: "Standard 120", checkIn: "Apr 06", nights: 2, party: 2, status: "checked-in" },
  { id: "RES-1016", guest: "Diego Herrera", room: "Suite 508", checkIn: "Apr 07", nights: 5, party: 3, status: "confirmed" },
  { id: "RES-1017", guest: "Yara Haddad", room: "Deluxe 318", checkIn: "Apr 08", nights: 2, party: 2, status: "pending" },
  { id: "RES-1018", guest: "Sven Johansson", room: "Standard 214", checkIn: "Apr 09", nights: 3, party: 1, status: "confirmed" },
  { id: "RES-1019", guest: "Camila Duarte", room: "Suite 407", checkIn: "Apr 10", nights: 4, party: 2, status: "checked-in" },
  { id: "RES-1020", guest: "Aleksander Nowak", room: "Deluxe 330", checkIn: "Apr 11", nights: 2, party: 3, status: "cancelled" },
  { id: "RES-1021", guest: "Leila Karimi", room: "Standard 222", checkIn: "Apr 12", nights: 1, party: 2, status: "confirmed" },
  { id: "RES-1022", guest: "Marcus Bergström", room: "Suite 511", checkIn: "Apr 13", nights: 7, party: 4, status: "pending" },
  { id: "RES-1023", guest: "Zoe Kapoor", room: "Deluxe 340", checkIn: "Apr 14", nights: 2, party: 2, status: "confirmed" },
];

const STATUS_META: Record<
  ReservationStatus,
  { label: string; variant: "neutral" | "success" | "warning" | "error" }
> = {
  confirmed: { label: "Confirmed", variant: "neutral" },
  "checked-in": { label: "Checked In", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "error" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked-in", label: "Checked In" },
  { value: "pending", label: "Pending" },
  { value: "cancelled", label: "Cancelled" },
];

type ViewState = "ready" | "loading" | "empty";

const VIEW_STATE_OPTIONS = [
  { value: "ready", label: "Live data" },
  { value: "loading", label: "Loading" },
  { value: "empty", label: "Empty" },
];

/* ── Pure data transforms (exported for direct testing) ─────────── */

/** Case-insensitive substring match across guest name, reservation id, and room. */
export function filterBySearch(rows: Reservation[], query: string): Reservation[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.guest.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.room.toLowerCase().includes(q)
  );
}

/** Subset to a single status; `"all"` passes every row through. */
export function filterByStatus(rows: Reservation[], status: string): Reservation[] {
  if (status === "all") return rows;
  return rows.filter((r) => r.status === status);
}

/** Sort a copy of `rows` by the active column — numeric columns numerically, else by locale. */
export function sortReservations(rows: Reservation[], sort: SortState | null): Reservation[] {
  if (!sort) return rows;
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv)) * factor;
  });
}

/** Slice the 1-indexed `page` of size `pageSize`. */
export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/* ── Source snippet + composition notes ──────── */

const SOURCE_JSX = `import { DataTable, Input, Select, Button, Badge, EmptyState, Pagination } from "@mattbutlerengineering/rialto";

// Local fixture — no service calls
const processed = sortReservations(filterByStatus(filterBySearch(rows, search), status), sort);
const pageRows = paginate(processed, page, PAGE_SIZE);

<Input label="Search reservations" value={search} onChange={(e) => setSearch(e.target.value)} />
<Select label="Filter by status" options={STATUS_FILTER_OPTIONS} value={status} onChange={setStatus} />

{selectedKeys.length > 0 && (
  <div role="region" aria-label="Bulk actions">
    <Text>{selectedKeys.length} selected</Text>
    <Button onClick={cancelSelected}>Cancel selected</Button>
  </div>
)}

<DataTable
  columns={COLUMNS}
  data={pageRows}
  rowKey={(row) => row.id}
  selectionMode="multiple"
  selectedKeys={selectedKeys}
  onSelectionChange={setSelectedKeys}
  sort={sort}
  onSortChange={setSort}
  label="Reservations"
/>
<Pagination page={page} totalPages={totalPages} onChange={setPage} />`;

const COMPOSITION_NOTES: ReactNode = (
  <>
    <CompositionNote>
      One workflow page composes DataTable, Input, Select, Button, Badge, EmptyState, and
      Pagination. Search, status filter, column sort, and pagination are pure transforms applied in
      sequence to a local fixture — the table only renders the current page slice, keeping the DOM
      light regardless of dataset size.
    </CompositionNote>
    <CompositionNote>
      Row selection is controlled: selected keys live in page state and drive a bulk-action bar that
      only mounts when a selection exists. Bulk and per-row actions return new arrays rather than
      mutating rows, so React always re-renders from a fresh reference.
    </CompositionNote>
    <CompositionNote>
      The view-state control makes the loading (Skeleton) and empty (EmptyState) states reachable
      without a backend, and a search that matches nothing falls through to the same empty state —
      every branch a real list page hits is demonstrable here.
    </CompositionNote>
  </>
);

/* ── Page component ──────────────────────────── */

export function ReservationsListExamplePage() {
  const [rows, setRows] = useState<Reservation[]>(RESERVATIONS);
  const [search, setSearch] = useState("");
  const [statusValue, setStatusValue] = useState("all");
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [viewState, setViewState] = useState<ViewState>("ready");

  const processed = useMemo(
    () => sortReservations(filterByStatus(filterBySearch(rows, search), statusValue), sort),
    [rows, search, statusValue, sort]
  );

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = paginate(processed, currentPage, PAGE_SIZE);
  const rangeStart = processed.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, processed.length);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatus = (value: string) => {
    setStatusValue(value);
    setPage(1);
  };

  const handleSort = (next: SortState | null) => {
    setSort(next);
    setPage(1);
  };

  const cancelSelected = () => {
    const targets = new Set(selectedKeys);
    setRows((prev) =>
      prev.map((r) => (targets.has(r.id) ? { ...r, status: "cancelled" } : r))
    );
    setSelectedKeys([]);
  };

  const resetView = () => {
    setSearch("");
    setStatusValue("all");
    setViewState("ready");
    setPage(1);
  };

  const columns = [
    { key: "id", header: "Reservation", sortable: true, rowHeader: true },
    { key: "guest", header: "Guest", sortable: true },
    { key: "room", header: "Room" },
    { key: "checkIn", header: "Check-in", sortable: true },
    { key: "party", header: "Party", align: "right" as const },
    { key: "nights", header: "Nights", sortable: true, align: "right" as const },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row: Reservation) => (
        <Badge variant={STATUS_META[row.status].variant}>{STATUS_META[row.status].label}</Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row: Reservation) => (
        <div className={styles.rowActions}>
          <Button variant="ghost" size="sm" aria-label={`View ${row.guest}`}>
            View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Cancel ${row.guest}`}
            disabled={row.status === "cancelled"}
            onClick={() =>
              setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: "cancelled" } : r)))
            }
          >
            Cancel
          </Button>
        </div>
      ),
    },
  ];

  let content: ReactNode;
  if (viewState === "loading") {
    content = (
      <SkeletonGroup>
        <Stack gap="md">
          <Skeleton variant="text" width="100%" height={44} />
          <Skeleton variant="text" width="100%" height={44} />
          <Skeleton variant="text" width="100%" height={44} />
          <Skeleton variant="text" width="100%" height={44} />
          <Skeleton variant="text" width="100%" height={44} />
        </Stack>
      </SkeletonGroup>
    );
  } else if (viewState === "empty" || processed.length === 0) {
    const filtersActive = search.trim() !== "" || statusValue !== "all";
    content = (
      <EmptyState
        heading="No reservations found"
        description={
          filtersActive
            ? "No reservations match your search and filters."
            : "Reservations will appear here once guests book rooms."
        }
        action={
          filtersActive ? (
            <Button variant="secondary" onClick={resetView}>
              Clear filters
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <DataTable<Reservation>
        columns={columns}
        data={pageRows}
        rowKey={(row) => row.id}
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={(keys) => setSelectedKeys(keys.map(String))}
        selectionLabel={(row) => `Select ${row.guest}`}
        sort={sort}
        onSortChange={handleSort}
        label="Reservations"
        striped
      />
    );
  }

  return (
    <ExamplePageLayout
      name="Reservations"
      description="Searchable, sortable, paginated list page with bulk selection, row actions, and reachable empty and loading states"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <Stack gap="lg">
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <Input
              label="Search reservations"
              placeholder="Search by guest, room, or ID"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <Select
            label="Filter by status"
            options={STATUS_FILTER_OPTIONS}
            value={statusValue}
            onChange={handleStatus}
          />
          <Select
            label="View state"
            options={VIEW_STATE_OPTIONS}
            value={viewState}
            onChange={(value) => setViewState(value as ViewState)}
          />
        </div>

        {selectedKeys.length > 0 && (
          <div className={styles.bulkBar} role="region" aria-label="Bulk actions">
            <Text variant="label">{selectedKeys.length} selected</Text>
            <div className={styles.bulkActions}>
              <Button variant="secondary" size="sm" onClick={cancelSelected}>
                Cancel selected
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedKeys([])}>
                Clear selection
              </Button>
            </div>
          </div>
        )}

        <Card>{content}</Card>

        {viewState === "ready" && processed.length > 0 && (
          <div className={styles.pagination}>
            <Text variant="caption" color="secondary">
              Showing {rangeStart}–{rangeEnd} of {processed.length}
            </Text>
            <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </Stack>
    </ExamplePageLayout>
  );
}

ReservationsListExamplePage.displayName = "ReservationsListExamplePage";
