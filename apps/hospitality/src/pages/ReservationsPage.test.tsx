/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReservationsPage } from "./ReservationsPage.js";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservations } from "../hooks/useReservations.js";
import React from "react";

const today = new Date().toLocaleDateString("en-CA");

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useReservations.js", () => ({ useReservations: vi.fn() }));

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
        <button
          key={s.id}
          data-testid={`segment-${s.id}`}
          onClick={() => onChange?.(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => (
    <div data-testid="skeleton-group">{children}</div>
  ),
  Stat: ({ label, value }: any) => (
    <div data-testid="stat">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  Text: ({ children }: any) => <span>{children}</span>,
}));

const defaultReservations = [
  {
    id: "r1",
    guestName: "Alice",
    date: today,
    startTime: "2026-01-15T18:00:00Z",
    endTime: "2026-01-15T20:00:00Z",
    partySize: 2,
    status: "CONFIRMED",
    notes: null,
    guestEmail: null,
    tableId: "t1",
  },
  {
    id: "r2",
    guestName: "Bob",
    date: today,
    startTime: "2026-01-15T19:00:00Z",
    endTime: "2026-01-15T21:00:00Z",
    partySize: 4,
    status: "PENDING",
    notes: null,
    guestEmail: null,
    tableId: "t2",
  },
  {
    id: "r3",
    guestName: "Carol",
    date: today,
    startTime: "2026-01-15T20:00:00Z",
    endTime: "2026-01-15T22:00:00Z",
    partySize: 6,
    status: "CANCELLED",
    notes: null,
    guestEmail: null,
    tableId: "t3",
  },
];

function mockReservationsHook(
  overrides: Partial<ReturnType<typeof useReservations>> = {}
) {
  vi.mocked(useReservations).mockReturnValue({
    data: defaultReservations as any,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as any);
}

describe("ReservationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [],
      selectVenue: vi.fn(),
    } as any);

    mockReservationsHook();
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

  it("displays guest names in the reservation list", () => {
    renderPage();
    expect(screen.getByText("Alice")).toBeDefined();
  });

  describe("stats display", () => {
    it("shows correct stat totals", () => {
      renderPage();
      const stats = screen.getAllByTestId("stat");
      expect(stats).toHaveLength(4);
      expect(stats[0].textContent).toContain("Total");
      expect(stats[0].textContent).toContain("3");
      expect(stats[1].textContent).toContain("Confirmed");
      expect(stats[1].textContent).toContain("1");
      expect(stats[2].textContent).toContain("Pending");
      expect(stats[2].textContent).toContain("1");
      expect(stats[3].textContent).toContain("Cancelled");
      expect(stats[3].textContent).toContain("1");
    });

    it("shows zero totals when no reservations", () => {
      mockReservationsHook({ data: [] as any });

      renderPage();

      const stats = screen.getAllByTestId("stat");
      expect(stats).toHaveLength(4);
      const zeroValues = stats.filter((s) => s.textContent?.includes("0"));
      expect(zeroValues).toHaveLength(4);
    });
  });

  describe("status filter", () => {
    it("clicking CONFIRMED segment filters to confirmed only", async () => {
      renderPage();

      expect(screen.getByText("Alice")).toBeDefined();
      expect(screen.getByText("Bob")).toBeDefined();
      expect(screen.getByText("Carol")).toBeDefined();

      fireEvent.click(screen.getByTestId("segment-CONFIRMED"));

      await waitFor(() => {
        expect(screen.getByText("Alice")).toBeDefined();
        expect(screen.queryByText("Bob")).toBeNull();
        expect(screen.queryByText("Carol")).toBeNull();
      });
    });

    it("clicking PENDING segment filters to pending only", async () => {
      renderPage();

      expect(screen.getByText("Bob")).toBeDefined();

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

      expect(screen.getByText("Alice")).toBeDefined();

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

      expect(screen.getByText("Alice")).toBeDefined();

      const searchInput = screen.getAllByTestId("search-input")[0];
      fireEvent.change(searchInput, { target: { value: "Zzznotfound" } });

      await waitFor(() => {
        expect(screen.getByTestId("empty-state")).toBeDefined();
      });
    });
  });

  describe("reservation row details", () => {
    it("displays party size for each reservation", () => {
      renderPage();
      expect(screen.getByText("2")).toBeDefined();
      expect(screen.getByText("4")).toBeDefined();
      expect(screen.getByText("6")).toBeDefined();
    });

    it("displays status badges", () => {
      renderPage();
      const badges = screen.getAllByTestId("badge");
      expect(badges.length).toBe(3);
    });

    it("displays notes or dash when no notes", () => {
      mockReservationsHook({
        data: [
          { ...defaultReservations[0], notes: "Window seat please" },
          { ...defaultReservations[1], notes: null },
        ] as any,
      });

      renderPage();

      expect(screen.getByText("Window seat please")).toBeDefined();
      expect(screen.getByText("-")).toBeDefined();
    });

    it("shows guest email when present", () => {
      mockReservationsHook({
        data: [
          { ...defaultReservations[0], guestEmail: "alice@example.com" },
        ] as any,
      });

      renderPage();

      expect(screen.getByText("alice@example.com")).toBeDefined();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no reservations for selected date", () => {
      mockReservationsHook({ data: [] as any });

      renderPage();

      expect(screen.getByTestId("empty-state")).toBeDefined();
      expect(screen.getByText("No reservations")).toBeDefined();
    });
  });

  describe("loading state", () => {
    it("shows skeleton when loading and no data", () => {
      mockReservationsHook({ data: undefined, isLoading: true });

      renderPage();

      expect(screen.getByTestId("skeleton-group")).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("shows error alert when query fails", () => {
      mockReservationsHook({ error: new Error("API failure") });

      renderPage();

      expect(screen.getByText("API failure")).toBeDefined();
    });
  });
});
