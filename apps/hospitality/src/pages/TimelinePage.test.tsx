/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  TimelineGrid: ({ tables, reservations, onReservationClick }: any) => (
    <div data-testid="timeline-grid">
      <span data-testid="table-count">{tables?.length ?? 0}</span>
      <span data-testid="res-count">{reservations?.length ?? 0}</span>
      {reservations?.map((r: any) => (
        <button key={r.id} data-testid={`res-${r.id}`} onClick={() => onReservationClick?.(r)}>
          {r.guestName}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../components/timeline/CancelReservationDialog", () => ({
  CancelReservationDialog: ({ open }: any) => open ? <div data-testid="cancel-dialog" /> : null,
}));

vi.mock("../components/timeline/EditReservationDrawer", () => ({
  EditReservationDrawer: ({ open }: any) => open ? <div data-testid="edit-drawer" /> : null,
}));

vi.mock("../components/timeline/WalkInDialog", () => ({
  WalkInDialog: () => <div data-testid="walkin-dialog" />,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Drawer: ({ children, open }: any) => open ? <div data-testid="drawer">{children}</div> : null,
  Button: ({ children, onClick, disabled, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} aria-label={rest["aria-label"]}>{children}</button>
  ),
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  Card: ({ children, title, variant }: any) => <div data-variant={variant}>{title}{children}</div>,
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
});
