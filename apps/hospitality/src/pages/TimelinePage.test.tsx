/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef, @eslint-react/no-array-index-key */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TimelinePage } from "./TimelinePage.js";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservationData } from "../contexts/ReservationDataContext.js";
import React from "react";

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));
vi.mock("@mbe/api-client", () => ({ createApiClient: vi.fn() }));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../contexts/ReservationDataContext.js", () => ({ useReservationData: vi.fn() }));

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
  const mockApi = {
    tables: { list: vi.fn(), updateStatus: vi.fn() },
    reservations: { list: vi.fn(), update: vi.fn(), cancelWithReason: vi.fn(), walkIn: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
    } as any);
    vi.mocked(useReservationData).mockReturnValue({
      reservations: [
        {
          id: "r1",
          guestName: "Alice",
          date: new Date().toLocaleDateString("en-CA"),
          startTime: "2026-05-10T18:00:00",
          endTime: "2026-05-10T20:00:00",
          partySize: 4,
          status: "CONFIRMED",
          tableId: "t1",
        },
      ],
      tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
      isConnected: true,
      sseError: null,
      setReservations: vi.fn(),
      setTables: vi.fn(),
      addReservation: vi.fn(),
      updateReservation: vi.fn(),
      removeReservation: vi.fn(),
      subscribeToEvents: vi.fn(() => vi.fn()),
    } as any);

    mockApi.tables.list.mockResolvedValue({
      data: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
    });
    mockApi.reservations.list.mockResolvedValue({
      data: [
        {
          id: "r1",
          guestName: "Alice",
          date: new Date().toLocaleDateString("en-CA"),
          startTime: "2026-05-10T18:00:00",
          endTime: "2026-05-10T20:00:00",
          partySize: 4,
          status: "CONFIRMED",
          tableId: "t1",
        },
      ],
    });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <TimelinePage />
      </MemoryRouter>
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

  it("fetches tables and reservations on mount", async () => {
    renderPage();
    await waitFor(() => {
      expect(mockApi.tables.list).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1" })
      );
    });
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
        <MemoryRouter initialEntries={[`/timeline?date=${date}`]}>
          <TimelinePage />
        </MemoryRouter>
      );

    it("navigates to the previous day when clicking previous button", async () => {
      renderWithDate("2026-05-10");
      await waitFor(() => {
        expect(screen.getByLabelText("Previous day")).toBeDefined();
      });
      fireEvent.click(screen.getByLabelText("Previous day"));
      await waitFor(() => {
        expect(mockApi.reservations.list).toHaveBeenCalledWith(
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
        expect(mockApi.reservations.list).toHaveBeenCalledWith(
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
        expect(mockApi.reservations.list).toHaveBeenCalledWith(
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
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            guestEmail: "alice@example.com",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "CONFIRMED",
            tableId: "t1",
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
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
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            guestPhone: "555-1234",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "CONFIRMED",
            tableId: "t1",
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
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
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            notes: "Window seat preferred",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "CONFIRMED",
            tableId: "t1",
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
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
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Solo",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 1,
            status: "CONFIRMED",
            tableId: "t1",
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
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
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "PENDING",
            tableId: "t1",
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
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
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "CANCELLED",
            tableId: "t1",
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
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
      const mockUpdateReservation = vi.fn();
      const mockSetTables = vi.fn();
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "CONFIRMED",
            tableId: "t1",
            table: { tableNumber: "T1", name: "Table 1" },
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: mockSetTables,
        addReservation: vi.fn(),
        updateReservation: mockUpdateReservation,
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
      const updatedRes = {
        id: "r1",
        guestName: "Alice",
        status: "CONFIRMED",
        tableId: "t1",
      };
      mockApi.reservations.update.mockResolvedValue(updatedRes);
      mockApi.tables.updateStatus.mockResolvedValue({});

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
        expect(mockApi.reservations.update).toHaveBeenCalledWith("r1", { status: "CONFIRMED" });
      });
      expect(mockApi.tables.updateStatus).toHaveBeenCalledWith("t1", "OCCUPIED");
      expect(mockUpdateReservation).toHaveBeenCalledWith(updatedRes);
    });

    it("sets error when seat API fails", async () => {
      mockApi.reservations.update.mockRejectedValue(new Error("Seat failed"));

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
      const mockUpdateReservation = vi.fn();
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "CONFIRMED",
            tableId: "t1",
            table: { tableNumber: "T1", name: "Table 1" },
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: mockUpdateReservation,
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
      mockApi.reservations.cancelWithReason.mockResolvedValue({});

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
        expect(mockApi.reservations.cancelWithReason).toHaveBeenCalledWith("r1", {
          cancellationReason: "no_show",
          cancellationNote: "test note",
        });
      });
      expect(mockUpdateReservation).toHaveBeenCalledWith(
        expect.objectContaining({ status: "CANCELLED" })
      );
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
      mockApi.reservations.cancelWithReason.mockRejectedValue(new Error("Cancel failed"));

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
      const mockUpdateReservation = vi.fn();
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "CONFIRMED",
            tableId: "t1",
            table: { tableNumber: "T1", name: "Table 1" },
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: mockUpdateReservation,
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
      const updatedRes = { id: "r1", guestName: "Alice", partySize: 6, status: "CONFIRMED" };
      mockApi.reservations.update.mockResolvedValue(updatedRes);

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
        expect(mockApi.reservations.update).toHaveBeenCalledWith("r1", { partySize: 6 });
      });
      expect(mockUpdateReservation).toHaveBeenCalledWith(updatedRes);
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
      mockApi.reservations.update.mockRejectedValue(new Error("Update failed"));

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
    it("calls API to create walk-in and updates tables", async () => {
      const mockAddReservation = vi.fn();
      const mockSetTables = vi.fn();
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: mockSetTables,
        addReservation: mockAddReservation,
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
      const walkInRes = { id: "r-walkin", guestName: "Walk-in Guest", partySize: 2 };
      mockApi.reservations.walkIn.mockResolvedValue(walkInRes);

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
        expect(mockApi.reservations.walkIn).toHaveBeenCalledWith(
          expect.objectContaining({ partySize: 2, tableId: "t1", venueId: "venue-1" })
        );
      });
      expect(mockAddReservation).toHaveBeenCalledWith(walkInRes);
    });

    it("sets error when walk-in API fails", async () => {
      mockApi.reservations.walkIn.mockRejectedValue(new Error("Walk-in failed"));

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
      mockApi.tables.updateStatus.mockResolvedValue({});
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("table-status-t1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("table-status-t1"));
      await waitFor(() => {
        expect(mockApi.tables.updateStatus).toHaveBeenCalledWith("t1", "OCCUPIED");
      });
    });
  });

  describe("SSE connection indicator", () => {
    it("shows Offline when disconnected", async () => {
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "CONFIRMED",
            tableId: "t1",
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: false,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("Offline")).toBeDefined();
      });
    });
  });

  describe("error and empty states", () => {
    it("shows error message when data fetch fails", async () => {
      mockApi.tables.list.mockRejectedValue(new Error("Network error"));
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.getByText("Network error")).toBeDefined();
    });

    it("shows generic error for non-Error throws", async () => {
      mockApi.tables.list.mockRejectedValue("something broke");
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeDefined();
      });
      expect(screen.getByText("Failed to load data")).toBeDefined();
    });

    it("shows empty state when no tables exist", async () => {
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [],
        tables: [],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
      mockApi.tables.list.mockResolvedValue({ data: [] });
      mockApi.reservations.list.mockResolvedValue({ data: [] });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText("No tables configured for this venue.")).toBeDefined();
      });
    });

    it("does not fetch when no venue is selected", async () => {
      vi.mocked(useVenue).mockReturnValue({
        selectedVenueId: null,
        venues: [],
        selectVenue: vi.fn(),
      } as any);
      renderPage();
      // Allow a tick for effects to run
      await waitFor(() => {
        expect(screen.getByTestId("page-header")).toBeDefined();
      });
      expect(mockApi.tables.list).not.toHaveBeenCalled();
    });
  });

  describe("stats display", () => {
    it("shows pending count when there are pending reservations", async () => {
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T18:00:00",
            endTime: "2026-05-10T20:00:00",
            partySize: 4,
            status: "CONFIRMED",
            tableId: "t1",
          },
          {
            id: "r2",
            guestName: "Bob",
            date: new Date().toLocaleDateString("en-CA"),
            startTime: "2026-05-10T19:00:00",
            endTime: "2026-05-10T21:00:00",
            partySize: 2,
            status: "PENDING",
            tableId: "t1",
          },
        ],
        tables: [{ id: "t1", name: "Table 1", tableNumber: "T1", priority: 1 }],
        isConnected: true,
        sseError: null,
        setReservations: vi.fn(),
        setTables: vi.fn(),
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);
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
      mockApi.reservations.update.mockResolvedValue(updatedRes);

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
      mockApi.reservations.cancelWithReason.mockResolvedValue({});

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
      mockApi.reservations.update.mockResolvedValue(updatedRes);
      mockApi.tables.updateStatus.mockResolvedValue({});

      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId("res-r1")).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("res-r1"));
      const drawer = await waitFor(() => screen.getByTestId("drawer"));
      fireEvent.click(within(drawer).getByText("Seat Guest"));
      await waitFor(() => {
        expect(mockApi.reservations.update).toHaveBeenCalledWith("r1", { status: "CONFIRMED" });
      });
    });
  });
});
