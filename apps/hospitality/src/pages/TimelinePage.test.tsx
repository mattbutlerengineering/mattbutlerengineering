import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
// Block transitive resolution of packages unavailable in this worktree environment
vi.mock("../hooks/useApiClient.js", () => ({ useApiClient: vi.fn() }));
vi.mock("../hooks/useReservations.js", () => ({
  useReservations: vi.fn(),
  RESERVATIONS_QUERY_KEY: "reservations",
}));
vi.mock("../hooks/useTables.js", () => ({ useTables: vi.fn(), TABLES_QUERY_KEY: "tables" }));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("../components/timeline", () => ({
  TimelineGrid: ({
    tables,
    reservations,
    onReservationClick,
    onTableStatusChange,
  }: {
    tables?: Table[];
    reservations?: Reservation[];
    onReservationClick?: (r: Reservation) => void;
    onTableStatusChange?: (id: string, status: string) => void;
  }) => (
    <div data-testid="timeline-grid">
      <span data-testid="table-count">{tables?.length ?? 0}</span>
      <span data-testid="res-count">{reservations?.length ?? 0}</span>
      {reservations?.map((r) => (
        <button key={r.id} data-testid={`res-${r.id}`} onClick={() => onReservationClick?.(r)}>
          {r.guestName}
        </button>
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
}));

vi.mock("../components/timeline/CancelReservationDialog", () => ({
  CancelReservationDialog: ({
    onConfirm,
    onClose,
  }: {
    onConfirm: (reason: string, note: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="cancel-dialog">
      <button data-testid="cancel-confirm" onClick={() => onConfirm("no_show", "test note")}>
        Confirm Cancel
      </button>
      <button data-testid="cancel-close" onClick={onClose}>
        Close Cancel
      </button>
    </div>
  ),
}));

vi.mock("../components/timeline/EditReservationDrawer", () => ({
  EditReservationDrawer: ({
    reservation,
    onSave,
    onClose,
  }: {
    reservation: Reservation;
    onSave: (id: string, data: Partial<Reservation>) => void;
    onClose: () => void;
  }) => (
    <div data-testid="edit-drawer">
      <span data-testid="edit-guest">{reservation.guestName}</span>
      <button data-testid="edit-save" onClick={() => onSave(reservation.id, { partySize: 6 })}>
        Save
      </button>
      <button data-testid="edit-close" onClick={onClose}>
        Close Edit
      </button>
    </div>
  ),
}));

vi.mock("../components/timeline/WalkInDialog", () => ({
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
    }) => void;
    onClose: () => void;
  }) => (
    <div data-testid="walkin-dialog">
      <button
        data-testid="walkin-confirm"
        onClick={() =>
          onConfirm({
            partySize: 2,
            tableId: tables?.[0]?.id ?? "t1",
            venueId,
            guestName: "Walk-in Guest",
          })
        }
      >
        Confirm Walk-in
      </button>
      <button data-testid="walkin-close" onClick={onClose}>
        Close Walk-in
      </button>
    </div>
  ),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Drawer: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={rest["aria-label"]}>
      {children}
    </button>
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

// Mock matchMedia for useIsMobile hook
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
    seatGuest: vi.fn().mockResolvedValue(defaultReservation),
    cancelReservation: vi.fn().mockResolvedValue(undefined),
    updateReservation: vi.fn().mockResolvedValue(defaultReservation),
    createWalkIn: vi.fn().mockResolvedValue(undefined),
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

  const renderPage = () =>
    render(
      <QueryClientProvider client={testQueryClient}>
        <MemoryRouter>
          <TimelinePage />
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

  it("shows stats when data is loaded", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Reservations:/)).toBeDefined();
    });
    expect(screen.getByText(/Covers:/)).toBeDefined();
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

    it("does not show Seat Guest button for non-CONFIRMED reservations", async () => {
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

    it("sets error when seatGuest fails", async () => {
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
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.getByText("Seat failed")).toBeDefined();
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

    it("sets error when cancelReservation fails", async () => {
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
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.getByText("Cancel failed")).toBeDefined();
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

    it("sets error when updateReservation fails", async () => {
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
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.getByText("Update failed")).toBeDefined();
    });
  });

  describe("walk-in flow", () => {
    it("calls createWalkIn from useTimelineData", async () => {
      const createWalkIn = vi.fn().mockResolvedValue(undefined);
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

    it("sets error when createWalkIn fails", async () => {
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
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.getByText("Walk-in failed")).toBeDefined();
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

  describe("error and empty states", () => {
    it("shows error message when data fetch fails", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          fetchError: new Error("Network error"),
          reservations: [],
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.getByText("Network error")).toBeDefined();
    });

    it("shows empty state when no tables exist", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({ reservations: [], tables: [] })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("No tables configured for this venue.")).toBeDefined();
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
    it("shows pending count when there are pending reservations", async () => {
      vi.mocked(useTimelineData).mockReturnValue(
        makeTimelineData({
          stats: { confirmed: 1, pending: 1, totalCovers: 6, total: 2 },
        })
      );
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("pending")).toBeDefined();
      });
    });

    it("does not show pending section when no pending reservations", async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("confirmed")).toBeDefined();
      });
      expect(screen.queryByText("pending")).toBeNull();
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
});
