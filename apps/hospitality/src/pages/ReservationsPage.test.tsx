import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReservationsPage } from "./ReservationsPage.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import { useReservationDisplay } from "../hooks/useReservationDisplay.js";
import type { UseReservationDisplayResult } from "../hooks/useReservationDisplay.js";
import type { Reservation } from "@mbe/types";
import React from "react";

const today = new Date().toLocaleDateString("en-CA");

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useReservationDisplay.js", () => ({ useReservationDisplay: vi.fn() }));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div data-testid="alert">{children}</div>,
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  EmptyState: ({
    heading,
    description,
  }: {
    heading: React.ReactNode;
    description?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <span>{heading}</span>
      <span>{description}</span>
    </div>
  ),
  Input: (props: {
    type?: string;
    placeholder?: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
  }) => (
    <input
      data-testid={props.type === "date" ? "date-input" : "search-input"}
      type={props.type}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
  SegmentedControl: ({
    segments,
    value: _value,
    onChange,
  }: {
    segments?: Array<{ id: string; label: string }>;
    value?: string;
    onChange?: (id: string) => void;
  }) => (
    <div data-testid="segmented-control">
      {segments?.map((s) => (
        <button key={s.id} data-testid={`segment-${s.id}`} onClick={() => onChange?.(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="skeleton-group">{children}</div>
  ),
  Stat: ({ label, value }: { label: React.ReactNode; value: React.ReactNode }) => (
    <div data-testid="stat">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

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
  return {
    id: "r1",
    date: today,
    startTime: "2026-01-15T18:00:00Z",
    endTime: "2026-01-15T20:00:00Z",
    partySize: 2,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName: null,
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

function makeDisplayResult(
  overrides: Partial<UseReservationDisplayResult> = {}
): UseReservationDisplayResult {
  return {
    data: undefined,
    stats: { total: 0, confirmed: 0, pending: 0, cancelled: 0 },
    filteredData: [],
    isLoading: false,
    error: null,
    ...overrides,
  };
}

const defaultReservations: Reservation[] = [
  makeReservation({
    id: "r1",
    guestName: "Alice",
    partySize: 2,
    status: "CONFIRMED",
    tableId: "t1",
  }),
  makeReservation({
    id: "r2",
    guestName: "Bob",
    startTime: "2026-01-15T19:00:00Z",
    endTime: "2026-01-15T21:00:00Z",
    partySize: 4,
    status: "PENDING",
    tableId: "t2",
  }),
  makeReservation({
    id: "r3",
    guestName: "Carol",
    startTime: "2026-01-15T20:00:00Z",
    endTime: "2026-01-15T22:00:00Z",
    partySize: 6,
    status: "CANCELLED",
    tableId: "t3",
  }),
];

const defaultStats = { total: 3, confirmed: 1, pending: 1, cancelled: 1 };

function mockDisplayHook(overrides: Partial<UseReservationDisplayResult> = {}) {
  vi.mocked(useReservationDisplay).mockReturnValue(
    makeDisplayResult({
      data: defaultReservations,
      stats: defaultStats,
      filteredData: defaultReservations,
      ...overrides,
    })
  );
}

describe("ReservationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    mockDisplayHook();
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
      mockDisplayHook({
        data: [],
        stats: { total: 0, confirmed: 0, pending: 0, cancelled: 0 },
        filteredData: [],
      });

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

      // Initially all shown (mock returns all)
      expect(screen.getByText("Alice")).toBeDefined();
      expect(screen.getByText("Bob")).toBeDefined();
      expect(screen.getByText("Carol")).toBeDefined();

      // Simulate hook returning only confirmed after URL param change
      mockDisplayHook({
        data: defaultReservations,
        stats: defaultStats,
        filteredData: [defaultReservations[0]], // only Alice
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

      mockDisplayHook({
        data: defaultReservations,
        stats: defaultStats,
        filteredData: [defaultReservations[1]], // only Bob
      });

      fireEvent.click(screen.getByTestId("segment-PENDING"));

      await waitFor(() => {
        expect(screen.queryByText("Alice")).toBeNull();
        expect(screen.getByText("Bob")).toBeDefined();
        expect(screen.queryByText("Carol")).toBeNull();
      });
    });

    it("clicking all segment shows all reservations again", async () => {
      // Start with confirmed filter
      mockDisplayHook({
        data: defaultReservations,
        stats: defaultStats,
        filteredData: [defaultReservations[0]],
      });
      renderPage();

      fireEvent.click(screen.getByTestId("segment-CONFIRMED"));
      await waitFor(() => {
        expect(screen.queryByText("Bob")).toBeNull();
      });

      // Switch back to all
      mockDisplayHook({
        data: defaultReservations,
        stats: defaultStats,
        filteredData: defaultReservations,
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

      mockDisplayHook({
        data: defaultReservations,
        stats: defaultStats,
        filteredData: [defaultReservations[1]], // only Bob
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

      mockDisplayHook({
        data: defaultReservations,
        stats: defaultStats,
        filteredData: [],
      });

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

    it("shows returning-guest badge with visit count when guest.visitCount > 1", () => {
      const dave = makeReservation({ id: "r1", guestName: "Dave", guest: { visitCount: 4 } });
      mockDisplayHook({
        data: [dave],
        stats: { total: 1, confirmed: 1, pending: 0, cancelled: 0 },
        filteredData: [dave],
      });

      renderPage();

      const badges = screen.getAllByTestId("badge");
      const badgeTexts = badges.map((b) => b.textContent);
      expect(badgeTexts.some((t) => t === "4th visit")).toBe(true);
    });

    it("does not show returning-guest badge when guest is null", () => {
      const eve = makeReservation({ id: "r1", guestName: "Eve", guest: null });
      mockDisplayHook({
        data: [eve],
        stats: { total: 1, confirmed: 1, pending: 0, cancelled: 0 },
        filteredData: [eve],
      });

      renderPage();

      const badges = screen.getAllByTestId("badge");
      const badgeTexts = badges.map((b) => b.textContent);
      expect(badgeTexts.some((t) => (t ?? "").includes("visit"))).toBe(false);
    });

    it("does not show returning-guest badge when guest.visitCount is 1", () => {
      const frank = makeReservation({ id: "r1", guestName: "Frank", guest: { visitCount: 1 } });
      mockDisplayHook({
        data: [frank],
        stats: { total: 1, confirmed: 1, pending: 0, cancelled: 0 },
        filteredData: [frank],
      });

      renderPage();

      const badges = screen.getAllByTestId("badge");
      const badgeTexts = badges.map((b) => b.textContent);
      expect(badgeTexts.some((t) => (t ?? "").includes("visit"))).toBe(false);
    });

    it("displays notes or dash when no notes", () => {
      const withNote = { ...defaultReservations[0], notes: "Window seat please" };
      const noNote = { ...defaultReservations[1], notes: null };
      mockDisplayHook({
        data: [withNote, noNote],
        stats: { total: 2, confirmed: 1, pending: 1, cancelled: 0 },
        filteredData: [withNote, noNote],
      });

      renderPage();

      expect(screen.getByText("Window seat please")).toBeDefined();
      expect(screen.getByText("-")).toBeDefined();
    });

    it("shows guest email when present", () => {
      const withEmail = { ...defaultReservations[0], guestEmail: "alice@example.com" };
      mockDisplayHook({
        data: [withEmail],
        stats: { total: 1, confirmed: 1, pending: 0, cancelled: 0 },
        filteredData: [withEmail],
      });

      renderPage();

      expect(screen.getByText("alice@example.com")).toBeDefined();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no reservations for selected date", () => {
      mockDisplayHook({
        data: [],
        stats: { total: 0, confirmed: 0, pending: 0, cancelled: 0 },
        filteredData: [],
      });

      renderPage();

      expect(screen.getByTestId("empty-state")).toBeDefined();
      expect(screen.getByText("No reservations")).toBeDefined();
    });
  });

  describe("loading state", () => {
    it("shows skeleton when loading and no data", () => {
      mockDisplayHook({ data: undefined, filteredData: [], isLoading: true });

      renderPage();

      expect(screen.getByTestId("skeleton-group")).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("shows error alert when query fails", () => {
      mockDisplayHook({ error: new Error("API failure") });

      renderPage();

      expect(screen.getByText("API failure")).toBeDefined();
    });
  });
});
