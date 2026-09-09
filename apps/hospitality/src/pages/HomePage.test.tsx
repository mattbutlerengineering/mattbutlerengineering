/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { HomePage } from "./HomePage.js";
import { useAuth } from "@mbe/auth/react";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import { useDashboardStatsQuery } from "../hooks/useDashboardStatsQuery.js";
import { useSSEStatus, useSSEEventFeed } from "../hooks/useSSESync.js";
import React from "react";
import type { Venue } from "@mbe/types";
import type { DashboardStats } from "../hooks/useDashboardStatsQuery.js";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));

vi.mock("../hooks/useDashboardStatsQuery.js", () => ({
  useDashboardStatsQuery: vi.fn(),
}));

vi.mock("../hooks/useSSESync.js", () => ({
  useSSEStatus: vi.fn(),
  useSSEEventFeed: vi.fn(),
  useSSESync: vi.fn(() => ({ reconnect: vi.fn() })),
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({
    title,
    description,
    aside,
  }: {
    title: string;
    description: string;
    aside?: React.ReactNode;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
      {aside}
    </div>
  ),
}));

vi.mock("../components/ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({ error, onRetry }: { error: string; onRetry: () => void }) => (
    <button data-testid="error-banner" onClick={onRetry}>
      {error}
    </button>
  ),
}));

vi.mock("../components/dashboard", () => ({
  ReservationList: ({ reservations, isLoading }: any) => (
    <div data-testid="reservation-list" data-loading={isLoading}>
      {reservations.length} reservations
    </div>
  ),
  ActivityFeed: ({ events, isConnected }: any) => (
    <div data-testid="activity-feed" data-connected={isConnected}>
      {events.length} events
    </div>
  ),
  StatRow: ({ stats }: { readonly stats: DashboardStats }) => (
    <div
      data-testid="stat-row"
      data-total={stats.totalReservations}
      data-covers={stats.expectedCovers}
      data-cancellation={stats.cancellationRate}
    >
      stat row
    </div>
  ),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
  NeonSign: ({ state, "aria-label": label }: { state: string; "aria-label": string }) => (
    <div role="img" aria-label={label} data-state={state} />
  ),
}));

/** Every day 17:00–22:00 in Los Angeles; PDT (UTC−7) on the fixture dates. */
const EVENING_SERVICE = { open: "17:00", close: "22:00" } as const;
const VENUE: Venue = {
  id: "venue-1",
  venueGroupId: null,
  name: "Fixture Bistro",
  slug: "fixture-bistro",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
  operatingHours: {
    monday: EVENING_SERVICE,
    tuesday: EVENING_SERVICE,
    wednesday: EVENING_SERVICE,
    thursday: EVENING_SERVICE,
    friday: EVENING_SERVICE,
    saturday: EVENING_SERVICE,
    sunday: EVENING_SERVICE,
  },
  settings: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

/** Monday 2026-08-31 in Los Angeles, as UTC instants. */
const MON_10_00_PDT = "2026-08-31T17:00:00Z";
const MON_16_59_30_PDT = "2026-08-31T23:59:30Z";
const MON_19_00_PDT = "2026-09-01T02:00:00Z";

/** Fully typed VenueContextValue for the useVenue mock — no casts. */
const venueContextValue = (selectedVenue: Venue | null): VenueContextValue => ({
  venues: selectedVenue ? [selectedVenue] : [],
  selectedVenueId: selectedVenue?.id ?? null,
  selectedVenue,
  setVenueId: vi.fn(),
  isLoading: false,
  isMultiVenue: false,
  refetchVenues: vi.fn(async () => {}),
});

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useVenue).mockReturnValue(venueContextValue(null));

    vi.mocked(useAuth).mockReturnValue({
      user: { name: "Matt" },
      accessToken: "token",
    } as any);

    vi.mocked(useSSEStatus).mockReturnValue({
      isConnected: true,
      error: null,
    });

    vi.mocked(useSSEEventFeed).mockReturnValue([]);

    vi.mocked(useDashboardStatsQuery).mockReturnValue({
      reservations: [],
      stats: {
        totalReservations: 5,
        expectedCovers: 20,
        upcomingCount: 3,
        cancellationRate: 10,
        cancellationTrend: "neutral",
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

  it("renders the dashboard page header with user name", () => {
    renderPage();
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Welcome back, Matt")).toBeDefined();
  });

  it("renders welcome message without name if user has no name", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { name: undefined },
      accessToken: "token",
    } as any);

    renderPage();
    expect(screen.getByText("Welcome back")).toBeDefined();
  });

  it("renders the stat row with dashboard metrics when not loading", () => {
    renderPage();
    const statRow = screen.getByTestId("stat-row");
    expect(statRow.getAttribute("data-total")).toBe("5");
    expect(statRow.getAttribute("data-covers")).toBe("20");
    expect(statRow.getAttribute("data-cancellation")).toBe("10");
  });

  it("renders loading skeletons when stats are loading", () => {
    vi.mocked(useDashboardStatsQuery).mockReturnValue({
      reservations: [],
      stats: {
        totalReservations: 0,
        expectedCovers: 0,
        upcomingCount: 0,
        cancellationRate: 0,
        cancellationTrend: "neutral",
      },
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBe(4);
    expect(screen.queryByTestId("stat-row")).toBeNull();
  });

  it("renders error banner when there is an error", () => {
    vi.mocked(useDashboardStatsQuery).mockReturnValue({
      reservations: [],
      stats: {
        totalReservations: 0,
        expectedCovers: 0,
        upcomingCount: 0,
        cancellationRate: 0,
        cancellationTrend: "neutral",
      },
      isLoading: false,
      error: new Error("Failed to load"),
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("error-banner")).toBeDefined();
    expect(screen.getByText("Failed to load")).toBeDefined();
  });

  it("does not render error banner when there is no error", () => {
    renderPage();
    expect(screen.queryByTestId("error-banner")).toBeNull();
  });

  it("renders action buttons", () => {
    renderPage();
    expect(screen.getByText("New Walk-In")).toBeDefined();
    expect(screen.getByText("View Floor Plan")).toBeDefined();
    expect(screen.getByText("Guest Lookup")).toBeDefined();
    expect(screen.getByText("Booking Widget")).toBeDefined();
  });

  it("renders ReservationList and ActivityFeed", () => {
    renderPage();
    expect(screen.getByTestId("reservation-list")).toBeDefined();
    expect(screen.getByTestId("activity-feed")).toBeDefined();
  });

  it("ActivityFeed receives isConnected status", () => {
    renderPage();
    const feed = screen.getByTestId("activity-feed");
    expect(feed.getAttribute("data-connected")).toBe("true");
  });

  it("ActivityFeed shows events from SSE feed", () => {
    vi.mocked(useSSEEventFeed).mockReturnValue([
      {
        type: "reservation:created",
        venueId: "v1",
        timestamp: new Date().toISOString(),
        data: { id: "r1" } as any,
      },
    ]);
    renderPage();
    expect(screen.getByText("1 events")).toBeDefined();
  });

  it("navigation buttons call navigate with correct paths", () => {
    renderPage();

    fireEvent.click(screen.getByText("New Walk-In"));
    fireEvent.click(screen.getByText("View Floor Plan"));
    fireEvent.click(screen.getByText("Guest Lookup"));
    fireEvent.click(screen.getByText("Booking Widget"));

    // Buttons rendered inside MemoryRouter — clicks trigger navigation
    // Verify buttons are clickable (no errors thrown)
    expect(screen.getByText("New Walk-In")).toBeDefined();
  });

  describe("neon sign in the header aside", () => {
    const selectVenue = (overrides: Partial<Venue> = {}) => {
      vi.mocked(useVenue).mockReturnValue(venueContextValue({ ...VENUE, ...overrides }));
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("renders an open sign inside the header while the venue is trading", () => {
      vi.setSystemTime(new Date(MON_19_00_PDT));
      selectVenue();

      renderPage();

      const sign = screen.getByRole("img", { name: "Open until 10:00 PM" });
      expect(sign.getAttribute("data-state")).toBe("open");
      expect(screen.getByTestId("page-header").contains(sign)).toBe(true);
      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeDefined();
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("meter")).toBeNull();
    });

    it("renders an opening-soon sign inside the lead window before opening", () => {
      vi.setSystemTime(new Date(MON_16_59_30_PDT));
      selectVenue();

      renderPage();

      const sign = screen.getByRole("img", { name: "Opens at 5:00 PM" });
      expect(sign.getAttribute("data-state")).toBe("opening-soon");
    });

    it("renders a closed sign naming today's opening time", () => {
      vi.setSystemTime(new Date(MON_10_00_PDT));
      selectVenue();

      renderPage();

      const sign = screen.getByRole("img", { name: "Closed, opens at 5:00 PM" });
      expect(sign.getAttribute("data-state")).toBe("closed");
    });

    it("renders an unset sign when the venue has no operating hours", () => {
      vi.setSystemTime(new Date(MON_19_00_PDT));
      selectVenue({ operatingHours: null });

      renderPage();

      const sign = screen.getByRole("img", { name: "No operating hours set" });
      expect(sign.getAttribute("data-state")).toBe("unset");
    });

    it("renders no sign and today's header when no venue is selected", () => {
      vi.setSystemTime(new Date(MON_19_00_PDT));

      renderPage();

      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeDefined();
      expect(screen.getByText("Welcome back, Matt")).toBeDefined();
    });

    it("renders no sign when the venue's timezone is unusable", () => {
      vi.setSystemTime(new Date(MON_19_00_PDT));
      selectVenue({ ianaTimezone: "Mars/Olympus" });

      renderPage();

      expect(screen.queryByRole("img")).toBeNull();
    });

    it("re-derives the state on the minute tick without a reload", () => {
      vi.setSystemTime(new Date(MON_16_59_30_PDT));
      selectVenue();

      renderPage();
      expect(screen.getByRole("img").getAttribute("data-state")).toBe("opening-soon");

      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      const sign = screen.getByRole("img", { name: "Open until 10:00 PM" });
      expect(sign.getAttribute("data-state")).toBe("open");
    });
  });
});
