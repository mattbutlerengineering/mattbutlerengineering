/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef, @eslint-react/no-array-index-key */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReservationsPage } from "./ReservationsPage.js";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservationData } from "../contexts/ReservationDataContext.js";
import React from "react";

const today = new Date().toLocaleDateString("en-CA");

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));
vi.mock("@mbe/api-client", () => ({ createApiClient: vi.fn() }));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../contexts/ReservationDataContext.js", () => ({ useReservationData: vi.fn() }));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: any) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  EmptyState: ({ heading, description }: any) => (
    <div data-testid="empty-state">
      <span>{heading}</span>
      <span>{description}</span>
    </div>
  ),
  Input: (props: any) => (
    <input
      data-testid={props.type === "date" ? "date-input" : "search-input"}
      type={props.type}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
  SegmentedControl: ({ segments, value: _value, onChange }: any) => (
    <div data-testid="segmented-control">
      {segments?.map((s: any) => (
        <button key={s.id} data-testid={`segment-${s.id}`} onClick={() => onChange?.(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Stat: ({ label, value }: any) => (
    <div data-testid="stat">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  Text: ({ children }: any) => <span>{children}</span>,
}));

describe("ReservationsPage", () => {
  const mockApi = {
    reservations: { list: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [],
      selectVenue: vi.fn(),
    } as any);
    vi.mocked(useReservationData).mockReturnValue({
      reservations: [
        {
          id: "r1",
          guestName: "Alice",
          date: today,
          startTime: "18:00",
          endTime: "20:00",
          partySize: 2,
          status: "CONFIRMED",
        },
        {
          id: "r2",
          guestName: "Bob",
          date: today,
          startTime: "19:00",
          endTime: "21:00",
          partySize: 4,
          status: "PENDING",
        },
        {
          id: "r3",
          guestName: "Carol",
          date: today,
          startTime: "20:00",
          endTime: "22:00",
          partySize: 6,
          status: "CANCELLED",
        },
      ],
      tables: [],
      isConnected: true,
      sseError: null,
      addReservation: vi.fn(),
      updateReservation: vi.fn(),
      removeReservation: vi.fn(),
      setReservations: vi.fn(),
      setTables: vi.fn(),
      subscribeToEvents: vi.fn(() => vi.fn()),
    } as any);

    mockApi.reservations.list.mockResolvedValue({
      data: [
        {
          id: "r1",
          guestName: "Alice",
          date: today,
          startTime: "18:00",
          endTime: "20:00",
          partySize: 2,
          status: "CONFIRMED",
        },
      ],
    });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ReservationsPage />
      </MemoryRouter>
    );

  it("renders the page header", () => {
    renderPage();
    expect(screen.getByText("Reservations")).toBeDefined();
  });

  it("renders status filter segments", () => {
    renderPage();
    expect(screen.getByTestId("segmented-control")).toBeDefined();
    expect(screen.getByTestId("segment-all")).toBeDefined();
    expect(screen.getByTestId("segment-CONFIRMED")).toBeDefined();
    expect(screen.getByTestId("segment-PENDING")).toBeDefined();
  });

  it("renders reservation stats", () => {
    renderPage();
    const stats = screen.getAllByTestId("stat");
    expect(stats.length).toBeGreaterThan(0);
  });

  it("renders search inputs", () => {
    renderPage();
    const inputs = screen.getAllByTestId("search-input");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("displays guest names in the reservation list", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });
  });

  describe("stats display", () => {
    it("shows correct stat totals", () => {
      renderPage();
      const stats = screen.getAllByTestId("stat");
      // Total=3, Confirmed=1, Pending=1, Cancelled=1
      expect(stats).toHaveLength(4);
      // Check stat values via stat element text content
      expect(stats[0].textContent).toContain("Total");
      expect(stats[0].textContent).toContain("3");
      expect(stats[1].textContent).toContain("Confirmed");
      expect(stats[1].textContent).toContain("1");
      expect(stats[2].textContent).toContain("Pending");
      expect(stats[2].textContent).toContain("1");
      expect(stats[3].textContent).toContain("Cancelled");
      expect(stats[3].textContent).toContain("1");
    });

    it("shows zero totals when no reservations", async () => {
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [],
        tables: [],
        isConnected: true,
        sseError: null,
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        setReservations: vi.fn(),
        setTables: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);

      // API must resolve so isLoading becomes false (otherwise skeleton renders)
      mockApi.reservations.list.mockResolvedValue({ data: [] });

      renderPage();

      await waitFor(() => {
        const stats = screen.getAllByTestId("stat");
        expect(stats).toHaveLength(4);
        const zeroValues = stats.filter((s) => s.textContent?.includes("0"));
        expect(zeroValues).toHaveLength(4);
      });
    });
  });

  describe("status filter", () => {
    it("clicking CONFIRMED segment filters to confirmed only", async () => {
      renderPage();

      // All three guests visible initially
      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeDefined();
        expect(screen.getByText("Bob")).toBeDefined();
        expect(screen.getByText("Carol")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("segment-CONFIRMED"));

      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeDefined();
        expect(screen.queryByText("Bob")).toBeNull();
        expect(screen.queryByText("Carol")).toBeNull();
      });
    });

    it("clicking PENDING segment filters to pending only", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Bob")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("segment-PENDING"));

      await waitFor(() => {
        expect(screen.queryByText("Alice")).toBeNull();
        expect(screen.getByText("Bob")).toBeDefined();
        expect(screen.queryByText("Carol")).toBeNull();
      });
    });

    it("clicking all segment shows all reservations again", async () => {
      renderPage();

      fireEvent.click(screen.getByTestId("segment-CONFIRMED"));

      await waitFor(() => {
        expect(screen.queryByText("Bob")).toBeNull();
      });

      fireEvent.click(screen.getByTestId("segment-all"));

      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeDefined();
        expect(screen.getByText("Bob")).toBeDefined();
        expect(screen.getByText("Carol")).toBeDefined();
      });
    });
  });

  describe("search filtering", () => {
    it("filters by guest name", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeDefined();
      });

      const searchInput = screen.getAllByTestId("search-input")[0];
      fireEvent.change(searchInput, { target: { value: "Bob" } });

      await waitFor(() => {
        expect(screen.queryByText("Alice")).toBeNull();
        expect(screen.getByText("Bob")).toBeDefined();
        expect(screen.queryByText("Carol")).toBeNull();
      });
    });

    it("shows empty state when search has no matches", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeDefined();
      });

      const searchInput = screen.getAllByTestId("search-input")[0];
      fireEvent.change(searchInput, { target: { value: "Zzznotfound" } });

      await waitFor(() => {
        expect(screen.getByTestId("empty-state")).toBeDefined();
      });
    });
  });

  describe("reservation row details", () => {
    it("displays party size for each reservation", async () => {
      renderPage();

      await waitFor(() => {
        // Party sizes: 2, 4, 6
        expect(screen.getByText("2")).toBeDefined();
        expect(screen.getByText("4")).toBeDefined();
        expect(screen.getByText("6")).toBeDefined();
      });
    });

    it("displays status badges", async () => {
      renderPage();

      await waitFor(() => {
        const badges = screen.getAllByTestId("badge");
        expect(badges.length).toBe(3);
      });
    });

    it("displays notes or dash when no notes", async () => {
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            date: today,
            startTime: "18:00",
            endTime: "20:00",
            partySize: 2,
            status: "CONFIRMED",
            notes: "Window seat please",
          },
          {
            id: "r2",
            guestName: "Bob",
            date: today,
            startTime: "19:00",
            endTime: "21:00",
            partySize: 4,
            status: "PENDING",
            notes: null,
          },
        ],
        tables: [],
        isConnected: true,
        sseError: null,
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        setReservations: vi.fn(),
        setTables: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Window seat please")).toBeDefined();
        expect(screen.getByText("-")).toBeDefined();
      });
    });

    it("shows guest email when present", async () => {
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            guestEmail: "alice@example.com",
            date: today,
            startTime: "18:00",
            endTime: "20:00",
            partySize: 2,
            status: "CONFIRMED",
          },
        ],
        tables: [],
        isConnected: true,
        sseError: null,
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        setReservations: vi.fn(),
        setTables: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("alice@example.com")).toBeDefined();
      });
    });
  });

  describe("empty state", () => {
    it("shows empty state when no reservations for selected date", async () => {
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [],
        tables: [],
        isConnected: true,
        sseError: null,
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        setReservations: vi.fn(),
        setTables: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);

      mockApi.reservations.list.mockResolvedValue({ data: [] });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId("empty-state")).toBeDefined();
        expect(screen.getByText("No reservations")).toBeDefined();
      });
    });
  });

  describe("connection status", () => {
    it("shows Live when connected", () => {
      renderPage();
      expect(screen.getByText("Live")).toBeDefined();
    });

    it("shows Offline when disconnected", () => {
      vi.mocked(useReservationData).mockReturnValue({
        reservations: [
          {
            id: "r1",
            guestName: "Alice",
            date: today,
            startTime: "18:00",
            endTime: "20:00",
            partySize: 2,
            status: "CONFIRMED",
          },
        ],
        tables: [],
        isConnected: false,
        sseError: null,
        addReservation: vi.fn(),
        updateReservation: vi.fn(),
        removeReservation: vi.fn(),
        setReservations: vi.fn(),
        setTables: vi.fn(),
        subscribeToEvents: vi.fn(() => vi.fn()),
      } as any);

      renderPage();
      expect(screen.getByText("Offline")).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("shows error alert when API fetch fails", async () => {
      mockApi.reservations.list.mockRejectedValue(new Error("API failure"));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText("API failure")).toBeDefined();
      });
    });
  });
});
