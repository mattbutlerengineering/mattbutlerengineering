/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TimelinePage } from "./TimelinePage.js";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservationData } from "../contexts/ReservationDataContext.js";
import { useReservations } from "../hooks/useReservations.js";
import { useTables } from "../hooks/useTables.js";
import React from "react";

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../contexts/ReservationDataContext.js", () => ({ useReservationData: vi.fn() }));
vi.mock("../hooks/useReservations.js", () => ({
  useReservations: vi.fn(),
  RESERVATIONS_QUERY_KEY: "reservations",
}));
vi.mock("../hooks/useTables.js", () => ({ useTables: vi.fn(), TABLES_QUERY_KEY: "tables" }));

const mockApiClient = {
  tables: { list: vi.fn(), updateStatus: vi.fn() },
  reservations: { list: vi.fn(), update: vi.fn(), cancelWithReason: vi.fn(), walkIn: vi.fn() },
};
vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: () => mockApiClient,
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: any) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("../components/timeline", () => ({
  TimelineGrid: ({ tables, reservations, onReservationClick, onTableStatusChange }: any) => (
    <div data-testid="timeline-grid">
      <span data-testid="table-count">{tables?.length ?? 0}</span>
      <span data-testid="res-count">{reservations?.length ?? 0}</span>
      {reservations?.map((r: any) => (
        <button key={r.id} data-testid={`res-${r.id}`} onClick={() => onReservationClick?.(r)}>
          {r.guestName}
        </button>
      ))}
      {tables?.map((t: any) => (
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
}));

vi.mock("../components/timeline/CancelReservationDialog", () => ({
  CancelReservationDialog: ({ onConfirm, onClose }: any) => (
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
  EditReservationDrawer: ({ reservation, onSave, onClose }: any) => (
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
  WalkInDialog: ({ tables, venueId, onConfirm, onClose }: any) => (
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
  Drawer: ({ children, open }: any) => (open ? <div data-testid="drawer">{children}</div> : null),
  Button: ({ children, onClick, disabled, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} aria-label={rest["aria-label"]}>
      {children}
    </button>
  ),
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  Card: ({ children, title, variant }: any) => (
    <div data-variant={variant}>
      {title}
      {children}
    </div>
  ),
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

describe("TimelinePage", () => {
  const todayStr = new Date().toLocaleDateString("en-CA");

  const defaultReservation = {
    id: "r1",
    guestName: "Alice",
    date: todayStr,
    startTime: "2026-05-10T18:00:00",
    endTime: "2026-05-10T20:00:00",
    partySize: 4,
    status: "CONFIRMED" as const,
    tableId: "t1",
  };

  const defaultTable = { id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 };

  function mockHooksWithData(
    overrides: {
      reservations?: any[];
      tables?: any[];
      isConnected?: boolean;
      reservationsLoading?: boolean;
      tablesLoading?: boolean;
      reservationsError?: Error | null;
      tablesError?: Error | null;
    } = {}
  ) {
    const {
      reservations = [defaultReservation],
      tables = [defaultTable],
      isConnected = true,
      reservationsLoading = false,
      tablesLoading = false,
      reservationsError = null,
      tablesError = null,
    } = overrides;

    vi.mocked(useReservations).mockReturnValue({
      data: reservations,
      isLoading: reservationsLoading,
      error: reservationsError,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useTables).mockReturnValue({
      data: tables,
      isLoading: tablesLoading,
      error: tablesError,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useReservationData).mockReturnValue({
      isConnected,
      sseError: null,
    } as any);
  }

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
    } as any);

    mockHooksWithData();
  });

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

  it("passes venue and date params to TQ hooks on mount", async () => {
    renderPage();
    expect(vi.mocked(useReservations)).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", date: todayStr })
    );
    expect(vi.mocked(useTables)).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1" })
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
        expect(vi.mocked(useReservations)).toHaveBeenCalledWith(
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
        expect(vi.mocked(useReservations)).toHaveBeenCalledWith(
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
        expect(vi.mocked(useReservations)).toHaveBeenCalledWith(
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
      mockHooksWithData({
        reservations: [{ ...defaultReservation, guestEmail: "alice@example.com" }],
      });
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
      mockHooksWithData({
        reservations: [{ ...defaultReservation, guestPhone: "555-1234" }],
      });
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
      mockHooksWithData({
        reservations: [{ ...defaultReservation, notes: "Window seat preferred" }],
      });
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
      mockHooksWithData({
        reservations: [{ ...defaultReservation, guestName: "Solo", partySize: 1 }],
      });
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
      mockHooksWithData({
        reservations: [{ ...defaultReservation, status: "PENDING" as const }],
      });
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
      mockHooksWithData({
        reservations: [{ ...defaultReservation, status: "CANCELLED" as const }],
      });
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
    it("calls API to update reservation and table status", async () => {
      mockHooksWithData({
        reservations: [{ ...defaultReservation, table: { tableNumber: "T1", name: "Table 1" } }],
      });
      const updatedRes = {
        id: "r1",
        guestName: "Alice",
        status: "CONFIRMED",
        tableId: "t1",
      };
      mockApiClient.reservations.update.mockResolvedValue(updatedRes);
      mockApiClient.tables.updateStatus.mockResolvedValue({});

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
        expect(mockApiClient.reservations.update).toHaveBeenCalledWith("r1", {
          status: "CONFIRMED",
        });
      });
      expect(mockApiClient.tables.updateStatus).toHaveBeenCalledWith("t1", "OCCUPIED");
    });

    it("sets error when seat API fails", async () => {
      mockApiClient.reservations.update.mockRejectedValue(new Error("Seat failed"));

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
    it("opens cancel dialog and calls API on confirm", async () => {
      mockHooksWithData({
        reservations: [{ ...defaultReservation, table: { tableNumber: "T1", name: "Table 1" } }],
      });
      mockApiClient.reservations.cancelWithReason.mockResolvedValue({});

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
        expect(mockApiClient.reservations.cancelWithReason).toHaveBeenCalledWith("r1", {
          cancellationReason: "no_show",
          cancellationNote: "test note",
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

    it("sets error when cancel API fails", async () => {
      mockApiClient.reservations.cancelWithReason.mockRejectedValue(new Error("Cancel failed"));

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
    it("opens edit drawer and calls API on save", async () => {
      mockHooksWithData({
        reservations: [{ ...defaultReservation, table: { tableNumber: "T1", name: "Table 1" } }],
      });
      const updatedRes = { id: "r1", guestName: "Alice", partySize: 6, status: "CONFIRMED" };
      mockApiClient.reservations.update.mockResolvedValue(updatedRes);

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
        expect(mockApiClient.reservations.update).toHaveBeenCalledWith("r1", { partySize: 6 });
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

    it("sets error when edit API fails", async () => {
      mockApiClient.reservations.update.mockRejectedValue(new Error("Update failed"));

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
    it("calls API to create walk-in", async () => {
      mockHooksWithData({ reservations: [] });
      const walkInRes = { id: "r-walkin", guestName: "Walk-in Guest", partySize: 2 };
      mockApiClient.reservations.walkIn.mockResolvedValue(walkInRes);

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
        expect(mockApiClient.reservations.walkIn).toHaveBeenCalledWith(
          expect.objectContaining({ partySize: 2, tableId: "t1", venueId: "venue-1" })
        );
      });
    });

    it("sets error when walk-in API fails", async () => {
      mockApiClient.reservations.walkIn.mockRejectedValue(new Error("Walk-in failed"));

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
    it("calls API to update table status", async () => {
      mockApiClient.tables.updateStatus.mockResolvedValue({});
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("table-status-t1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("table-status-t1"));
      await waitFor(() => {
        expect(mockApiClient.tables.updateStatus).toHaveBeenCalledWith("t1", "OCCUPIED");
      });
    });
  });

  describe("SSE connection indicator", () => {
    it("shows Offline when disconnected", async () => {
      mockHooksWithData({ isConnected: false });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Offline")).toBeDefined();
      });
    });
  });

  describe("error and empty states", () => {
    it("shows error message when data fetch fails", async () => {
      mockHooksWithData({
        reservationsError: new Error("Network error"),
        reservations: undefined as any,
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.getByText("Network error")).toBeDefined();
    });

    it("shows error from tables hook", async () => {
      mockHooksWithData({
        tablesError: new Error("Tables failed"),
        tables: undefined as any,
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.getByText("Tables failed")).toBeDefined();
    });

    it("shows empty state when no tables exist", async () => {
      mockHooksWithData({ reservations: [], tables: [] });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("No tables configured for this venue.")).toBeDefined();
      });
    });

    it("disables hooks when no venue is selected", async () => {
      vi.mocked(useVenue).mockReturnValue({
        selectedVenueId: null,
        venues: [],
        selectVenue: vi.fn(),
      } as any);
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("page-header")).toBeDefined();
      });
      expect(vi.mocked(useReservations)).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
      expect(vi.mocked(useTables)).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });
  });

  describe("stats display", () => {
    it("shows pending count when there are pending reservations", async () => {
      mockHooksWithData({
        reservations: [
          defaultReservation,
          {
            id: "r2",
            guestName: "Bob",
            date: todayStr,
            startTime: "2026-05-10T19:00:00",
            endTime: "2026-05-10T21:00:00",
            partySize: 2,
            status: "PENDING" as const,
            tableId: "t1",
          },
        ],
      });
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
      const updatedRes = { id: "r1", guestName: "Alice", partySize: 6, status: "CONFIRMED" };
      mockApiClient.reservations.update.mockResolvedValue(updatedRes);

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
      mockApiClient.reservations.cancelWithReason.mockResolvedValue({});

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
      const updatedRes = { id: "r1", guestName: "Alice", status: "CONFIRMED", tableId: "t1" };
      mockApiClient.reservations.update.mockResolvedValue(updatedRes);
      mockApiClient.tables.updateStatus.mockResolvedValue({});

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      const drawer = await waitFor(() => screen.getByTestId("drawer"));
      fireEvent.click(within(drawer).getByText("Seat Guest"));
      await waitFor(() => {
        expect(mockApiClient.reservations.update).toHaveBeenCalledWith("r1", {
          status: "CONFIRMED",
        });
      });
    });
  });
});
