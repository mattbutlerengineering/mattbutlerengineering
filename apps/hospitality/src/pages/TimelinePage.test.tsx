import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TimelinePage } from "./TimelinePage.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import { useSSEStatus } from "../hooks/useSSESync.js";
import { useTimelineData } from "../hooks/useTimelineData.js";
import type { UseTimelineDataResult } from "../hooks/useTimelineData.js";
import type { Reservation, Table } from "@mbe/types";
import React from "react";

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useSSESync.js", () => ({
  useSSEStatus: vi.fn(),
  useSSESync: vi.fn(() => ({ reconnect: vi.fn() })),
  useSSEEventFeed: vi.fn(() => []),
}));
vi.mock("../hooks/useTimelineData.js", () => ({ useTimelineData: vi.fn() }));
vi.mock("../hooks/useCancellationQuote.js", () => ({
  useCancellationQuote: vi.fn().mockReturnValue({ quote: null, isLoading: false }),
}));
// Block transitive resolution of packages unavailable in this worktree environment
vi.mock("../hooks/useApiClient.js", () => ({ useApiClient: vi.fn() }));
vi.mock("../hooks/useReservations.js", () => ({
  useReservations: vi.fn(),
  RESERVATIONS_QUERY_KEY: "reservations",
}));
vi.mock("../hooks/useTables.js", () => ({ useTables: vi.fn(), TABLES_QUERY_KEY: "tables" }));

vi.mock("../components/PageHeader", () => ({
  // tabIndex={-1} like the real one: useFocusAfter's pageHeading target lands here after Retry.
  PageHeader: ({ title }: { title: string }) => (
    <div data-testid="page-header">
      <h1 tabIndex={-1}>{title}</h1>
    </div>
  ),
}));

vi.mock("../components/timeline", () => ({
  TimelineGrid: ({
    tables,
    reservations,
    onReservationClick,
    onTableStatusChange,
    selectedReservationId,
  }: {
    tables?: Table[];
    reservations?: Reservation[];
    onReservationClick?: (r: Reservation) => void;
    onTableStatusChange?: (id: string, status: string) => void;
    selectedReservationId?: string | null;
  }) => (
    <div data-testid="timeline-grid">
      <span data-testid="table-count">{tables?.length ?? 0}</span>
      <span data-testid="res-count">{reservations?.length ?? 0}</span>
      {reservations?.map((r) => (
        <React.Fragment key={r.id}>
          <button data-testid={`res-${r.id}`} onClick={() => onReservationClick?.(r)}>
            {r.guestName}
          </button>
          {/* The real block's test id and pressed state: the page's focus and selection targets. */}
          <button
            data-testid={`reservation-block-${r.id}`}
            aria-pressed={selectedReservationId === r.id}
          >
            block {r.id}
          </button>
        </React.Fragment>
      ))}
      {tables?.map((t) => (
        <button
          key={t.id}
          data-testid={`table-status-${t.id}`}
          onClick={() => onTableStatusChange?.(t.id, "OCCUPIED")}
        >
          Change {t.name}
        </button>
      ))}
    </div>
  ),
  TimelineMobileView: ({
    reservations,
    onReservationClick,
  }: {
    reservations?: Reservation[];
    onReservationClick?: (r: Reservation) => void;
  }) => (
    <div data-testid="timeline-mobile-view">
      {reservations?.map((r) => (
        <button key={r.id} data-testid={`res-${r.id}`} onClick={() => onReservationClick?.(r)}>
          {r.guestName}
        </button>
      ))}
    </div>
  ),
  ReservationDetails: ({ reservation }: { reservation: Reservation }) => (
    <div data-testid="reservation-details">{reservation.guestName}</div>
  ),
  ReservationSheet: ({ reservation, open }: { reservation: Reservation; open: boolean }) =>
    open ? <div data-testid="reservation-sheet">{reservation.guestName}</div> : null,
  TimelineSkeleton: () => <div data-testid="timeline-skeleton" />,
}));

// The dialog stand-ins honour the rethrow contract (architecture § Dialog contracts): like the
// real dialogs they consume the promise the page hands back, reporting its outcome so the page's
// rethrow can be asserted — and so a rejection never escapes as an unhandled error.
vi.mock("../components/timeline/CancelReservationDialog", async () => {
  const { useState } = await vi.importActual<typeof React>("react");
  return {
    CancelReservationDialog: ({
      onConfirm,
      onClose,
    }: {
      onConfirm: (reason: string, note: string) => Promise<void>;
      onClose: () => void;
    }) => {
      const [outcome, setOutcome] = useState("");
      return (
        <div data-testid="cancel-dialog">
          <button
            data-testid="cancel-confirm"
            onClick={() =>
              onConfirm("no_show", "test note").then(
                () => setOutcome("resolved"),
                () => setOutcome("rejected")
              )
            }
          >
            Confirm Cancel
          </button>
          <span data-testid="cancel-outcome">{outcome}</span>
          <button data-testid="cancel-close" onClick={onClose}>
            Close Cancel
          </button>
        </div>
      );
    },
  };
});

vi.mock("../components/timeline/EditReservationDrawer", async () => {
  const { useState } = await vi.importActual<typeof React>("react");
  return {
    EditReservationDrawer: ({
      reservation,
      onSave,
      onClose,
    }: {
      reservation: Reservation;
      onSave: (id: string, data: Partial<Reservation>) => Promise<void>;
      onClose: () => void;
    }) => {
      const [outcome, setOutcome] = useState("");
      return (
        <div data-testid="edit-drawer">
          <span data-testid="edit-guest">{reservation.guestName}</span>
          <button
            data-testid="edit-save"
            onClick={() =>
              onSave(reservation.id, { partySize: 6 }).then(
                () => setOutcome("resolved"),
                () => setOutcome("rejected")
              )
            }
          >
            Save
          </button>
          <span data-testid="edit-outcome">{outcome}</span>
          <button data-testid="edit-close" onClick={onClose}>
            Close Edit
          </button>
        </div>
      );
    },
  };
});

vi.mock("../components/timeline/WalkInDialog", async () => {
  const { useState } = await vi.importActual<typeof React>("react");
  return {
    WalkInDialog: ({
      tables,
      venueId,
      onConfirm,
      onClose,
    }: {
      tables?: Table[];
      venueId?: string;
      onConfirm: (data: {
        partySize: number;
        tableId: string;
        venueId?: string;
        guestName: string;
      }) => Promise<void>;
      onClose: () => void;
    }) => {
      const [outcome, setOutcome] = useState("");
      return (
        <div data-testid="walkin-dialog">
          <button
            data-testid="walkin-confirm"
            onClick={() =>
              onConfirm({
                partySize: 2,
                tableId: tables?.[0]?.id ?? "t1",
                venueId,
                guestName: "Walk-in Guest",
              }).then(
                () => setOutcome("resolved"),
                () => setOutcome("rejected")
              )
            }
          >
            Confirm Walk-in
          </button>
          <span data-testid="walkin-outcome">{outcome}</span>
          <button data-testid="walkin-close" onClick={onClose}>
            Close Walk-in
          </button>
        </div>
      );
    },
  };
});

vi.mock("@mattbutlerengineering/rialto", () => ({
  Drawer: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
  Button: ({
    children,
    onClick,
    disabled,
    ref,
    variant,
    size,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    ref?: React.Ref<HTMLButtonElement>;
    variant?: string;
    size?: string;
    "aria-label"?: string;
    "aria-describedby"?: string;
  }) => (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      aria-label={rest["aria-label"]}
      aria-describedby={rest["aria-describedby"]}
      data-variant={variant}
      data-size={size}
    >
      {children}
    </button>
  ),
  IconButton: ({
    icon,
    onClick,
    variant,
    size,
    ...rest
  }: {
    icon: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    "aria-label": string;
  }) => (
    <button
      onClick={onClick}
      aria-label={rest["aria-label"]}
      data-variant={variant}
      data-size={size}
    >
      {icon}
    </button>
  ),
  EmptyState: ({
    heading,
    description,
    action,
  }: {
    heading?: string;
    description?: string;
    action?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <h2>{heading}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  ),
  Alert: ({
    title,
    children,
    actions,
    dismissible,
    onDismiss,
  }: {
    title?: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
    dismissible?: boolean;
    onDismiss?: () => void;
  }) => (
    <div role="alert">
      {title && <p>{title}</p>}
      {children}
      {actions}
      {dismissible && <button onClick={onDismiss}>Dismiss</button>}
    </div>
  ),
  Collapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Stat: ({
    label,
    value,
    ...rest
  }: {
    label: string;
    value: React.ReactNode;
    "aria-label"?: string;
  }) => (
    <div role="group" aria-label={rest["aria-label"] ?? label}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
  Card: ({
    children,
    title,
    variant,
  }: {
    children: React.ReactNode;
    title?: React.ReactNode;
    variant?: string;
  }) => (
    <div data-variant={variant}>
      {title}
      {children}
    </div>
  ),
  Divider: () => <hr />,
}));

// Mock matchMedia for useViewport (desktop by default: no query matches)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ── Typed mock factories ─────────────────────────────────────────────────────

function makeVenueContext(overrides: Partial<VenueContextValue> = {}): VenueContextValue {
  return {
    selectedVenueId: "venue-1",
    venues: [],
    selectedVenue: null,
    setVenueId: vi.fn(),
    isLoading: false,
    isMultiVenue: false,
    refetchVenues: vi.fn(),
    ...overrides,
  };
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  const todayStr = new Date().toLocaleDateString("en-CA");
  return {
    id: "r1",
    date: todayStr,
    startTime: "2026-05-10T18:00:00",
    endTime: "2026-05-10T20:00:00",
    partySize: 4,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: "Alice",
    guestEmail: null,
    guestPhone: null,
    guestId: null,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "t1",
    venueId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "t1",
    name: "Table 1",
    tableNumber: "T1",
    capacity: 4,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: null,
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** What `createWalkIn` resolves to by default: the record the page selects, speaks about and focuses. */
const WALK_IN_RESERVATION = makeReservation({
  id: "r-walkin",
  guestName: "Walk-in Guest",
  partySize: 2,
  tableId: "t1",
});

function makeTimelineData(overrides: Partial<UseTimelineDataResult> = {}): UseTimelineDataResult {
  const todayStr = new Date().toLocaleDateString("en-CA");
  const defaultReservation = makeReservation({ date: todayStr });
  const defaultTable = makeTable();
  return {
    reservations: [defaultReservation],
    tables: [defaultTable],
    isLoading: false,
    fetchError: null,
    stats: { confirmed: 1, pending: 0, totalCovers: 4, total: 1 },
    isFromCache: false,
    lastSyncedAt: undefined,
    refetch: vi.fn().mockResolvedValue(undefined),
    seatGuest: vi.fn().mockResolvedValue(defaultReservation),
    cancelReservation: vi.fn().mockResolvedValue(undefined),
    updateReservation: vi.fn().mockResolvedValue(defaultReservation),
    createWalkIn: vi.fn().mockResolvedValue(WALK_IN_RESERVATION),
    updateTableStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("TimelinePage", () => {
  const todayStr = new Date().toLocaleDateString("en-CA");
  const defaultReservation = makeReservation({ guestName: "Alice", date: todayStr });

  const testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Renders the router's current search string so a stripped intent can be asserted.
  function LocationProbe() {
    const { search } = useLocation();
    return <span data-testid="location-search">{search}</span>;
  }

  const renderPage = (initialEntries: string[] = ["/timeline"]) =>
    render(
      <QueryClientProvider client={testQueryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <TimelinePage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    );

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useVenue).mockReturnValue(
      makeVenueContext({
        venues: [
          {
            id: "venue-1",
            name: "Test Venue",
            venueGroupId: null,
            slug: "test-venue",
            ianaTimezone: "America/New_York",
            currencyCode: "USD",
            operatingHours: null,
            settings: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
        selectedVenue: {
          id: "venue-1",
          name: "Test Venue",
          venueGroupId: null,
          slug: "test-venue",
          ianaTimezone: "America/New_York",
          currencyCode: "USD",
          operatingHours: null,
          settings: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      })
    );

    vi.mocked(useSSEStatus).mockReturnValue({ isConnected: true, error: null });
    vi.mocked(useTimelineData).mockReturnValue(makeTimelineData());
  });

  it("renders the timeline page header", async () => {
    renderPage();
    expect(screen.getByTestId("page-header")).toBeDefined();
    expect(screen.getByText("Timeline")).toBeDefined();
  });

  it("renders the timeline grid after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("timeline-grid")).toBeDefined();
    });
  });

  it("shows walk-in button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Walk-in")).toBeDefined();
    });
  });

  it("opens walk-in dialog when walk-in button is clicked", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Walk-in")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Walk-in"));
    expect(screen.getByTestId("walkin-dialog")).toBeDefined();
  });

  it("passes venue and date params to useTimelineData", async () => {
    renderPage();
    expect(vi.mocked(useTimelineData)).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", date: todayStr })
    );
  });

  it("shows date navigation buttons after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText("Previous day")).toBeDefined();
    });
    expect(screen.getByLabelText("Next day")).toBeDefined();
  });

  it("shows the four KpiStats with their values once data is loaded (item 15 rewrite of the stats row)", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Reservations" })).toHaveTextContent("1");
    });
    expect(screen.getByRole("group", { name: "Covers" })).toHaveTextContent("4");
    expect(screen.getByRole("group", { name: "Confirmed" })).toHaveTextContent("1");
    expect(screen.getByRole("group", { name: "Pending" })).toHaveTextContent("0");
  });

  it("shows live connection indicator", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Live")).toBeDefined();
    });
  });

  describe("date navigation", () => {
    const renderWithDate = (date: string) =>
      render(
        <QueryClientProvider client={testQueryClient}>
          <MemoryRouter initialEntries={[`/timeline?date=${date}`]}>
            <TimelinePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

    it("navigates to the previous day when clicking previous button", async () => {
      renderWithDate("2026-05-10");
      await waitFor(() => {
        expect(screen.getByLabelText("Previous day")).toBeDefined();
      });
      fireEvent.click(screen.getByLabelText("Previous day"));
      await waitFor(() => {
        expect(vi.mocked(useTimelineData)).toHaveBeenCalledWith(
          expect.objectContaining({ date: "2026-05-09" })
        );
      });
    });

    it("navigates to the next day when clicking next button", async () => {
      renderWithDate("2026-05-10");
      await waitFor(() => {
        expect(screen.getByLabelText("Next day")).toBeDefined();
      });
      fireEvent.click(screen.getByLabelText("Next day"));
      await waitFor(() => {
        expect(vi.mocked(useTimelineData)).toHaveBeenCalledWith(
          expect.objectContaining({ date: "2026-05-11" })
        );
      });
    });

    it("shows Today button when viewing a non-today date", async () => {
      renderWithDate("2026-01-01");
      await waitFor(() => {
        expect(screen.getByText("Today")).toBeDefined();
      });
    });

    it("does not show Today button when viewing today", async () => {
      const today = new Date().toLocaleDateString("en-CA");
      renderWithDate(today);
      await waitFor(() => {
        expect(screen.getByTestId("timeline-grid")).toBeDefined();
      });
      expect(screen.queryByText("Today")).toBeNull();
    });

    it("navigates back to today when clicking Today button", async () => {
      renderWithDate("2026-01-01");
      await waitFor(() => {
        expect(screen.getByText("Today")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Today"));
      const today = new Date().toLocaleDateString("en-CA");
      await waitFor(() => {
        expect(vi.mocked(useTimelineData)).toHaveBeenCalledWith(
          expect.objectContaining({ date: today })
        );
      });
    });
  });

  describe("reservation selection and details sidebar", () => {
    it("shows reservation details when clicking a reservation", async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Reservation Details")).toBeDefined();
      });
      expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(2);
    });

    it("displays guest email when present", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          reservations: [{ ...defaultReservation, guestEmail: "alice@example.com" }],
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("alice@example.com")).toBeDefined();
      });
    });

    it("displays guest phone when present", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          reservations: [{ ...defaultReservation, guestPhone: "555-1234" }],
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("555-1234")).toBeDefined();
      });
    });

    it("displays notes when present", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          reservations: [{ ...defaultReservation, notes: "Window seat preferred" }],
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Window seat preferred")).toBeDefined();
      });
    });

    it("shows party size with correct pluralization", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          reservations: [{ ...defaultReservation, guestName: "Solo", partySize: 1 }],
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("1 guest")).toBeDefined();
      });
    });

    it("closes sidebar when close button is clicked", async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Reservation Details")).toBeDefined();
      });
      fireEvent.click(screen.getByLabelText("Close reservation details"));
      await waitFor(() => {
        expect(screen.queryByText("Reservation Details")).toBeNull();
      });
    });

    it("shows Seat Guest for a PENDING reservation on a free table (item 13 rule)", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          reservations: [{ ...defaultReservation, status: "PENDING" as const }],
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Seat Guest")).toBeDefined();
      });
    });

    it("does not show Seat Guest button for a reservation that is neither PENDING nor CONFIRMED", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          reservations: [{ ...defaultReservation, status: "COMPLETED" as const }],
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Edit Reservation")).toBeDefined();
      });
      expect(screen.queryByText("Seat Guest")).toBeNull();
    });

    it("does not show Cancel Reservation button for CANCELLED reservations", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          reservations: [{ ...defaultReservation, status: "CANCELLED" as const }],
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Edit Reservation")).toBeDefined();
      });
      expect(screen.queryByText("Cancel Reservation")).toBeNull();
    });
  });

  describe("seat guest flow", () => {
    it("calls seatGuest from useTimelineData", async () => {
      const seatGuest = vi.fn().mockResolvedValue(defaultReservation);
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ seatGuest }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Seat Guest")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Seat Guest"));
      await waitFor(() => {
        expect(seatGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
      });
    });

    it("lets the panel own a failed seat — 'Guest not seated.' inside it, the grid still mounted (item 15 rewrite: no page error state)", async () => {
      const seatGuest = vi.fn().mockRejectedValue(new Error("Seat failed"));
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ seatGuest }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Seat Guest")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Seat Guest"));
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Guest not seated.");
      });
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getByTestId("timeline-grid")).toBeDefined();
      expect(screen.getByText("Reservation Details")).toBeDefined();
    });
  });

  describe("cancel reservation flow", () => {
    it("opens cancel dialog and calls cancelReservation on confirm", async () => {
      const cancelReservation = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ cancelReservation }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Cancel Reservation")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Cancel Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("cancel-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("cancel-confirm"));
      await waitFor(() => {
        expect(cancelReservation).toHaveBeenCalledWith("r1", {
          reason: "no_show",
          note: "test note",
          quote: null,
        });
      });
    });

    it("closes cancel dialog without cancelling", async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Cancel Reservation")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Cancel Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("cancel-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("cancel-close"));
      await waitFor(() => {
        expect(screen.queryByTestId("cancel-dialog")).toBeNull();
      });
    });

    it("rethrows a failed cancel so the dialog owns the failure (item 12 bridge)", async () => {
      const cancelReservation = vi.fn().mockRejectedValue(new Error("Cancel failed"));
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ cancelReservation }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Cancel Reservation")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Cancel Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("cancel-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("cancel-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("cancel-outcome")).toHaveTextContent("rejected");
      });
      // The dialog stays mounted for its own banner; the page has not closed it.
      expect(screen.getByTestId("cancel-dialog")).toBeDefined();
    });

    it("leaves the grid mounted and shows no page-level alert when cancel fails (item 15 rewrite: no page error state)", async () => {
      const cancelReservation = vi.fn().mockRejectedValue(new Error("Cancel failed"));
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ cancelReservation }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Cancel Reservation")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Cancel Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("cancel-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("cancel-confirm"));
      await waitFor(() => {
        expect(screen.getByTestId("cancel-outcome")).toHaveTextContent("rejected");
      });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByTestId("timeline-grid")).toBeDefined();
      expect(screen.getByRole("status")).toHaveTextContent("");
    });
  });

  describe("edit reservation flow", () => {
    it("opens edit drawer and calls updateReservation on save", async () => {
      const updated = { ...defaultReservation, partySize: 6 };
      const updateReservation = vi.fn().mockResolvedValue(updated);
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ updateReservation }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Edit Reservation")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Edit Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("edit-drawer")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("edit-save"));
      await waitFor(() => {
        expect(updateReservation).toHaveBeenCalledWith("r1", { partySize: 6 });
      });
    });

    it("closes edit drawer after a successful save", async () => {
      const updated = { ...defaultReservation, partySize: 6 };
      const updateReservation = vi.fn().mockResolvedValue(updated);
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ updateReservation }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Edit Reservation")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Edit Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("edit-drawer")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("edit-save"));
      await waitFor(() => {
        expect(screen.queryByTestId("edit-drawer")).toBeNull();
      });
    });

    it("closes edit drawer without saving", async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Edit Reservation")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Edit Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("edit-drawer")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("edit-close"));
      await waitFor(() => {
        expect(screen.queryByTestId("edit-drawer")).toBeNull();
      });
    });

    it("rethrows a failed edit so the drawer owns the failure (item 12 bridge)", async () => {
      const updateReservation = vi.fn().mockRejectedValue(new Error("Update failed"));
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ updateReservation }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Edit Reservation")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Edit Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("edit-drawer")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("edit-save"));

      await waitFor(() => {
        expect(screen.getByTestId("edit-outcome")).toHaveTextContent("rejected");
      });
      expect(screen.getByTestId("edit-drawer")).toBeDefined();
    });

    it("leaves the grid mounted and shows no page-level alert when edit fails (item 15 rewrite: no page error state)", async () => {
      const updateReservation = vi.fn().mockRejectedValue(new Error("Update failed"));
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ updateReservation }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByText("Edit Reservation")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Edit Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("edit-drawer")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("edit-save"));
      await waitFor(() => {
        expect(screen.getByTestId("edit-outcome")).toHaveTextContent("rejected");
      });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByTestId("timeline-grid")).toBeDefined();
      expect(screen.getByRole("status")).toHaveTextContent("");
    });
  });

  describe("walk-in flow", () => {
    it("calls createWalkIn from useTimelineData", async () => {
      const createWalkIn = vi.fn().mockResolvedValue(WALK_IN_RESERVATION);
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ reservations: [], createWalkIn })
      );

      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Walk-in")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Walk-in"));
      await waitFor(() => {
        expect(screen.getByTestId("walkin-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("walkin-confirm"));
      await waitFor(() => {
        expect(createWalkIn).toHaveBeenCalledWith(
          expect.objectContaining({ partySize: 2, tableId: "t1", venueId: "venue-1" })
        );
      });
    });

    it("closes walk-in dialog after a successful create", async () => {
      const createWalkIn = vi.fn().mockResolvedValue(WALK_IN_RESERVATION);
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ reservations: [], createWalkIn })
      );

      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Walk-in")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Walk-in"));
      await waitFor(() => {
        expect(screen.getByTestId("walkin-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("walkin-confirm"));
      await waitFor(() => {
        expect(screen.queryByTestId("walkin-dialog")).toBeNull();
      });
    });

    it("rethrows a failed walk-in so the dialog owns the failure (item 12 bridge)", async () => {
      const createWalkIn = vi.fn().mockRejectedValue(new Error("Walk-in failed"));
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ createWalkIn }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Walk-in")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Walk-in"));
      await waitFor(() => {
        expect(screen.getByTestId("walkin-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("walkin-confirm"));

      await waitFor(() => {
        expect(screen.getByTestId("walkin-outcome")).toHaveTextContent("rejected");
      });
      expect(screen.getByTestId("walkin-dialog")).toBeDefined();
    });

    it("leaves timeline-grid mounted and shows no page-level alert when the walk-in is rejected (item 15 rewrite: no page error state)", async () => {
      const createWalkIn = vi.fn().mockRejectedValue(new Error("Walk-in failed"));
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ createWalkIn }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Walk-in")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Walk-in"));
      await waitFor(() => {
        expect(screen.getByTestId("walkin-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("walkin-confirm"));
      await waitFor(() => {
        expect(screen.getByTestId("walkin-outcome")).toHaveTextContent("rejected");
      });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByTestId("timeline-grid")).toBeDefined();
      expect(screen.getByTestId("res-count")).toHaveTextContent("1");
      expect(screen.getByRole("status")).toHaveTextContent("");
    });

    it("closes walk-in dialog without creating", async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Walk-in")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Walk-in"));
      await waitFor(() => {
        expect(screen.getByTestId("walkin-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("walkin-close"));
      await waitFor(() => {
        expect(screen.queryByTestId("walkin-dialog")).toBeNull();
      });
    });
  });

  describe("table status changes", () => {
    it("calls updateTableStatus from useTimelineData", async () => {
      const updateTableStatus = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ updateTableStatus }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("table-status-t1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("table-status-t1"));
      await waitFor(() => {
        expect(updateTableStatus).toHaveBeenCalledWith("t1", "OCCUPIED");
      });
    });

    it("shows error message when updateTableStatus fails (e.g. 409 conflict)", async () => {
      const updateTableStatus = vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Invalid table transition: cannot transition from 'DIRTY' to 'AVAILABLE'. Valid transitions from 'DIRTY': [READY]"
          )
        );
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ updateTableStatus }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("table-status-t1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("table-status-t1"));
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Table status not changed.");
      });
      // The 409's own sentence is never the surface text — it sits in the details block.
      expect(screen.getByRole("alert")).toHaveTextContent(/Invalid table transition/);
      expect(screen.getByTestId("timeline-grid")).toBeDefined();
    });
  });

  describe("SSE connection indicator", () => {
    it("shows Offline when disconnected", async () => {
      vi.mocked(useSSEStatus).mockReturnValue({ isConnected: false, error: null });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Offline")).toBeDefined();
      });
    });
  });

  describe("offline banner", () => {
    it("is absent when data is fresh and connected", async () => {
      vi.mocked(useSSEStatus).mockReturnValue({ isConnected: true, error: null });
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ isFromCache: false, lastSyncedAt: undefined })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("timeline-grid")).toBeDefined();
      });
      expect(screen.queryByTestId("offline-banner")).toBeNull();
    });

    it("renders when reservations were served from the offline cache", async () => {
      vi.mocked(useSSEStatus).mockReturnValue({ isConnected: true, error: null });
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ isFromCache: true, lastSyncedAt: 1_700_000_000_000 })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("offline-banner")).toBeDefined();
      });
      expect(screen.getByTestId("offline-banner").getAttribute("role")).toBe("status");
    });

    it("renders when the SSE connection is down, even with fresh (non-cached) data", async () => {
      vi.mocked(useSSEStatus).mockReturnValue({ isConnected: false, error: null });
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ isFromCache: false, lastSyncedAt: 1_700_000_000_000 })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("offline-banner")).toBeDefined();
      });
    });
  });

  describe("error and empty states", () => {
    it("shows the load banner beside a grid that stays mounted when the fetch fails with tables present (item 15 rewrite: load axis)", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          fetchError: new Error("Network error"),
          reservations: [],
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Couldn't load tonight's reservations."
        );
      });
      // The raw request line is demoted to the details block, never the sentence.
      expect(screen.getByText("Network error")).toBeDefined();
      expect(screen.getByTestId("timeline-grid")).toBeDefined();
      expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Walk-in" })).toBeEnabled();
    });

    it("shows the 'Couldn't load tonight.' empty state with Retry, Walk-in disabled with its caption and stats '—' when nothing loaded", async () => {
      const refetch = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          fetchError: new Error("Network error"),
          reservations: [],
          tables: [],
          refetch,
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Couldn't load tonight." })).toBeDefined();
      });
      expect(screen.queryByTestId("timeline-grid")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      const walkIn = screen.getByRole("button", { name: "Walk-in" });
      expect(walkIn).toBeDisabled();
      expect(screen.getByText("Walk-ins need the tables loaded — Retry above.")).toBeDefined();
      expect(screen.getAllByText("—")).toHaveLength(4);
      expect(screen.getByRole("group", { name: "Reservations, unavailable" })).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => {
        expect(refetch).toHaveBeenCalledTimes(1);
      });
    });

    it("speaks and focuses the page heading after a Retry that resolves", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          fetchError: new Error("Network error"),
          reservations: [],
          tables: [],
        })
      );
      renderPage();
      const retry = await waitFor(() => screen.getByRole("button", { name: "Retry" }));
      fireEvent.click(retry);
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Tonight's grid loaded.");
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
      });
    });

    it("stays silent after a Retry that rejects — the load surface is the failure's voice", async () => {
      const refetch = vi.fn().mockRejectedValue(new Error("Still down"));
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          fetchError: new Error("Network error"),
          reservations: [],
          tables: [],
          refetch,
        })
      );
      renderPage();
      const retry = await waitFor(() => screen.getByRole("button", { name: "Retry" }));
      fireEvent.click(retry);
      await waitFor(() => {
        expect(refetch).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByRole("status")).toHaveTextContent("");
      expect(screen.getByRole("heading", { name: "Couldn't load tonight." })).toBeDefined();
    });

    it("shows the skeleton and four '—' stats while loading, never a grid or a zero", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          isLoading: true,
          reservations: [],
          tables: [],
          stats: { confirmed: 0, pending: 0, totalCovers: 0, total: 0 },
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("timeline-skeleton")).toBeDefined();
      });
      expect(screen.queryByTestId("timeline-grid")).toBeNull();
      expect(screen.queryByRole("heading", { name: "No tables yet." })).toBeNull();
      expect(screen.getAllByText("—")).toHaveLength(4);
      expect(screen.queryByText("0")).toBeNull();
    });

    it("shows 'No tables yet.' when no tables exist (item 15 rewrite: ux.md Screen 7 copy)", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ reservations: [], tables: [] })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "No tables yet." })).toBeDefined();
      });
      expect(screen.getByText("Set up a floor plan and the grid fills in.")).toBeDefined();
      expect(screen.queryByTestId("timeline-grid")).toBeNull();
    });

    it("links the empty-state hint to the Floor Plans page instead of leaving it as inert text", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ reservations: [], tables: [] })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("link", { name: /floor plans/i })).toHaveAttribute(
          "href",
          "/floor-plans"
        );
      });
    });

    it("passes disabled params to useTimelineData when no venue is selected", async () => {
      vi.mocked(useVenue).mockReturnValue(makeVenueContext({ selectedVenueId: null, venues: [] }));
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("page-header")).toBeDefined();
      });
      expect(vi.mocked(useTimelineData)).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: undefined })
      );
    });
  });

  describe("stats display", () => {
    it("shows the pending count in its KpiStat (item 15 rewrite: four KpiStats, always)", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          stats: { confirmed: 1, pending: 1, totalCovers: 6, total: 2 },
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("group", { name: "Pending" })).toHaveTextContent("1");
      });
      expect(screen.getByRole("group", { name: "Reservations" })).toHaveTextContent("2");
    });

    it("keeps the Pending KpiStat at 0 when nothing is pending — the row's layout never changes (item 15 rewrite)", async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("group", { name: "Confirmed" })).toHaveTextContent("1");
      });
      expect(screen.getByRole("group", { name: "Pending" })).toHaveTextContent("0");
      expect(screen.getAllByRole("group")).toHaveLength(4);
    });
  });

  describe("mobile view", () => {
    const setMobile = () => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    };

    const resetDesktop = () => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    };

    afterEach(() => {
      resetDesktop();
    });

    it("renders mobile drawer when matchMedia matches", async () => {
      setMobile();
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      await waitFor(() => {
        expect(screen.getByTestId("drawer")).toBeDefined();
      });
    });

    it("opens edit drawer from mobile reservation details", async () => {
      setMobile();
      const updateReservation = vi.fn().mockResolvedValue(defaultReservation);
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ updateReservation }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      const drawer = await waitFor(() => screen.getByTestId("drawer"));
      fireEvent.click(within(drawer).getByText("Edit Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("edit-drawer")).toBeDefined();
      });
    });

    it("opens cancel dialog from mobile reservation details", async () => {
      setMobile();
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      const drawer = await waitFor(() => screen.getByTestId("drawer"));
      fireEvent.click(within(drawer).getByText("Cancel Reservation"));
      await waitFor(() => {
        expect(screen.getByTestId("cancel-dialog")).toBeDefined();
      });
    });

    it("seats guest from mobile reservation details", async () => {
      setMobile();
      const seatGuest = vi.fn().mockResolvedValue(defaultReservation);
      vi.mocked(useTimelineData).mockReturnValue(makeTimelineData({ seatGuest }));

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      const drawer = await waitFor(() => screen.getByTestId("drawer"));
      fireEvent.click(within(drawer).getByText("Seat Guest"));
      await waitFor(() => {
        expect(seatGuest).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
      });
    });
  });

  // ── Item 15 (#5034): the orchestrator's contract ─────────────────────────────

  describe("URL intent (item 15)", () => {
    it("opens the walk-in dialog from /timeline?walkin=true and strips the param on close", async () => {
      renderPage(["/timeline?walkin=true"]);
      await waitFor(() => {
        expect(screen.getByTestId("walkin-dialog")).toBeDefined();
      });
      expect(screen.getByTestId("location-search")).toHaveTextContent("?walkin=true");

      fireEvent.click(screen.getByTestId("walkin-close"));
      await waitFor(() => {
        expect(screen.queryByTestId("walkin-dialog")).toBeNull();
      });
      expect(screen.getByTestId("location-search")).not.toHaveTextContent("walkin");
    });

    it("keeps date while stripping the intent after a walk-in created from the URL", async () => {
      renderPage(["/timeline?date=2026-05-10&walkin=true"]);
      await waitFor(() => {
        expect(screen.getByTestId("walkin-dialog")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("walkin-confirm"));
      await waitFor(() => {
        expect(screen.queryByTestId("walkin-dialog")).toBeNull();
      });
      expect(screen.getByTestId("location-search")).toHaveTextContent("?date=2026-05-10");
      expect(screen.getByTestId("location-search")).not.toHaveTextContent("walkin");
    });

    it("holds the URL-opened dialog back while the grid is still loading", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ isLoading: true, reservations: [], tables: [] })
      );
      renderPage(["/timeline?walkin=true"]);
      await waitFor(() => {
        expect(screen.getByTestId("timeline-skeleton")).toBeDefined();
      });
      expect(screen.queryByTestId("walkin-dialog")).toBeNull();
    });

    it("returns focus to the Walk-in button when a URL-opened dialog closes (Escape has no opener to restore)", async () => {
      renderPage(["/timeline?walkin=true"]);
      await waitFor(() => {
        expect(screen.getByTestId("walkin-dialog")).toBeDefined();
      });
      expect(document.activeElement).toBe(document.body);

      fireEvent.click(screen.getByTestId("walkin-close"));
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Walk-in" }));
      });
    });

    it("selects the reservation named by selected=<id> and strips the param when the details close", async () => {
      renderPage(["/timeline?selected=r1"]);
      await waitFor(() => {
        expect(screen.getByText("Reservation Details")).toBeDefined();
      });
      expect(screen.getByTestId("reservation-block-r1")).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(screen.getByLabelText("Close reservation details"));
      await waitFor(() => {
        expect(screen.queryByText("Reservation Details")).toBeNull();
      });
      expect(screen.getByTestId("reservation-block-r1")).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTestId("location-search")).not.toHaveTextContent("selected");
    });

    it("ignores a selected=<id> that names no reservation on this date", async () => {
      renderPage(["/timeline?selected=nope"]);
      await waitFor(() => {
        expect(screen.getByTestId("timeline-grid")).toBeDefined();
      });
      expect(screen.queryByText("Reservation Details")).toBeNull();
    });
  });

  describe("mutation outcomes: one sentence, one focus target (item 15)", () => {
    it("mounts the page's single live region empty from the first render", async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("timeline-grid")).toBeDefined();
      });
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.getByRole("status")).toHaveTextContent("");
    });

    it("walk-in success: selects the new block, names the table in one sentence and focuses the block", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ reservations: [defaultReservation, WALK_IN_RESERVATION] })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Walk-in")).toBeDefined();
      });
      fireEvent.click(screen.getByText("Walk-in"));
      fireEvent.click(await waitFor(() => screen.getByTestId("walkin-confirm")));

      await waitFor(() => {
        expect(screen.queryByTestId("walkin-dialog")).toBeNull();
      });
      expect(screen.getByRole("status")).toHaveTextContent(
        "Seated Walk-in Guest, party of 2, at Table 1."
      );
      expect(screen.getAllByRole("status")).toHaveLength(1);
      const block = screen.getByTestId("reservation-block-r-walkin");
      expect(block).toHaveAttribute("aria-pressed", "true");
      await waitFor(() => {
        expect(document.activeElement).toBe(block);
      });
      // The sidebar follows the id: the panel now describes the walk-in.
      expect(screen.getByText("Reservation Details")).toBeDefined();
      expect(screen.getAllByText("Walk-in Guest").length).toBeGreaterThanOrEqual(1);
    });

    it("walk-in success without a guest name speaks 'Seated a walk-in, …'", async () => {
      const anonymous = { ...WALK_IN_RESERVATION, guestName: "" };
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ createWalkIn: vi.fn().mockResolvedValue(anonymous) })
      );
      renderPage();
      fireEvent.click(await waitFor(() => screen.getByText("Walk-in")));
      fireEvent.click(await waitFor(() => screen.getByTestId("walkin-confirm")));
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(
          "Seated a walk-in, party of 2, at Table 1."
        );
      });
    });

    it("seat success: one sentence naming guest and table, focus on the block, selection kept", async () => {
      renderPage();
      fireEvent.click(await waitFor(() => screen.getByTestId("res-r1")));
      fireEvent.click(await waitFor(() => screen.getByText("Seat Guest")));
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent("Seated Alice at Table 1.");
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByTestId("reservation-block-r1"));
      });
      expect(screen.getByText("Reservation Details")).toBeDefined();
      expect(screen.getAllByRole("status")).toHaveLength(1);
    });

    it("cancel success: clears the selection, speaks once and focuses the block", async () => {
      renderPage();
      fireEvent.click(await waitFor(() => screen.getByTestId("res-r1")));
      fireEvent.click(await waitFor(() => screen.getByText("Cancel Reservation")));
      fireEvent.click(await waitFor(() => screen.getByTestId("cancel-confirm")));
      await waitFor(() => {
        expect(screen.queryByTestId("cancel-dialog")).toBeNull();
      });
      expect(screen.queryByText("Reservation Details")).toBeNull();
      expect(screen.getByTestId("reservation-block-r1")).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("status")).toHaveTextContent("Cancelled Alice's reservation.");
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByTestId("reservation-block-r1"));
      });
    });

    it("edit success: speaks once and returns focus to the Edit button that opened the drawer", async () => {
      renderPage();
      fireEvent.click(await waitFor(() => screen.getByTestId("res-r1")));
      const edit = await waitFor(() => screen.getByText("Edit Reservation"));
      edit.focus();
      fireEvent.click(edit);
      fireEvent.click(await waitFor(() => screen.getByTestId("edit-save")));
      await waitFor(() => {
        expect(screen.queryByTestId("edit-drawer")).toBeNull();
      });
      expect(screen.getByRole("status")).toHaveTextContent("Saved changes to Alice's reservation.");
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByText("Edit Reservation"));
      });
      expect(screen.getByText("Reservation Details")).toBeDefined();
    });
  });

  describe("seated is a fact about the floor (item 15)", () => {
    it("hides Seat Guest and reads 'Seated' for a CONFIRMED party on an OCCUPIED table inside its slot", async () => {
      const now = Date.now();
      const iso = (ms: number) => new Date(ms).toISOString();
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          reservations: [
            makeReservation({
              status: "CONFIRMED",
              startTime: iso(now - 30 * 60_000),
              endTime: iso(now + 90 * 60_000),
            }),
          ],
          tables: [makeTable({ status: "OCCUPIED" })],
        })
      );
      renderPage();
      fireEvent.click(await waitFor(() => screen.getByTestId("res-r1")));
      await waitFor(() => {
        expect(screen.getByText("Seated")).toBeDefined();
      });
      expect(screen.queryByText("Seat Guest")).toBeNull();
    });
  });

  describe("viewport composition (item 15)", () => {
    afterEach(() => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
    });

    it("tablet: grid plus the bottom sheet, no sidebar", async () => {
      vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
        matches: query === "(max-width: 1024px)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      renderPage();
      fireEvent.click(await waitFor(() => screen.getByTestId("res-r1")));
      await waitFor(() => {
        expect(screen.getByTestId("reservation-sheet")).toBeDefined();
      });
      expect(screen.getByTestId("timeline-grid")).toBeDefined();
      expect(screen.queryByText("Reservation Details")).toBeNull();
      expect(screen.queryByTestId("drawer")).toBeNull();
    });

    it("desktop: grid plus the Card sidebar, no sheet", async () => {
      renderPage();
      fireEvent.click(await waitFor(() => screen.getByTestId("res-r1")));
      await waitFor(() => {
        expect(screen.getByText("Reservation Details")).toBeDefined();
      });
      expect(screen.queryByTestId("reservation-sheet")).toBeNull();
      expect(screen.queryByTestId("drawer")).toBeNull();
    });
  });

  describe("header controls (item 15)", () => {
    it("day arrows are md IconButtons, Today is secondary, Walk-in is primary — all size md", async () => {
      renderPage(["/timeline?date=2026-01-01"]);
      const previous = await waitFor(() => screen.getByLabelText("Previous day"));
      expect(previous).toHaveAttribute("data-size", "md");
      expect(screen.getByLabelText("Next day")).toHaveAttribute("data-size", "md");
      const today = screen.getByRole("button", { name: "Today" });
      expect(today).toHaveAttribute("data-variant", "secondary");
      expect(today).toHaveAttribute("data-size", "md");
      const walkIn = screen.getByRole("button", { name: "Walk-in" });
      expect(walkIn).toHaveAttribute("data-variant", "primary");
      expect(walkIn).toHaveAttribute("data-size", "md");
    });
  });
  describe("module CSS (item 15)", () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "TimelinePage.module.css"),
      "utf-8"
    );

    it("gives the day arrows, Today and Walk-in a 44 px minimum under the coarse-pointer / tablet query", () => {
      const coarseBlock = css.match(
        /@media \(pointer: coarse\), \(max-width: 1024px\) \{([\s\S]*?)\n\}/
      );
      expect(coarseBlock).not.toBeNull();
      expect(coarseBlock?.[1]).toMatch(
        /\.navButton,\s*\.todayButton,\s*\.walkInButton\s*\{[^}]*min-block-size:\s*44px/
      );
      expect(coarseBlock?.[1]).toMatch(
        /\.navButton,\s*\.todayButton,\s*\.walkInButton\s*\{[^}]*min-inline-size:\s*44px/
      );
    });

    it("hides the sidebar below 1025 px — the tablet band gets the sheet, not a squeezed column", () => {
      const tabletBlock = css.match(/@media \(max-width: 1024px\) \{([\s\S]*?)\n\}/);
      expect(tabletBlock).not.toBeNull();
      expect(tabletBlock?.[1]).toMatch(/\.sidebar\s*\{[^}]*display:\s*none/);
      // The phone block keeps its compact header rules; the sidebar rule no longer lives there.
      const phoneBlock = css.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/);
      expect(phoneBlock?.[1] ?? "").not.toMatch(/\.sidebar/);
    });
  });
});
