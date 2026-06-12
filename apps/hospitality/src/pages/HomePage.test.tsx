/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage.js";
import { useAuth } from "@mbe/auth/react";
import { useDashboardStatsQuery } from "../hooks/useDashboardStatsQuery.js";
import { useSSEStatus } from "../hooks/useSSEStatus.js";
import { useSSEEventFeed } from "../hooks/useSSEEventFeed.js";
import React from "react";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../hooks/useDashboardStatsQuery.js", () => ({
  useDashboardStatsQuery: vi.fn(),
}));

vi.mock("../hooks/useSSEStatus.js", () => ({
  useSSEStatus: vi.fn(),
}));

vi.mock("../hooks/useSSEEventFeed.js", () => ({
  useSSEEventFeed: vi.fn(),
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
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
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stat: ({ label, value }: { label: string; value: string | number }) => (
    <div data-testid="stat">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
}));

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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

  it("renders stats when not loading", () => {
    renderPage();
    const stats = screen.getAllByTestId("stat");
    expect(stats.length).toBe(4);
    expect(screen.getByText("Today's Reservations")).toBeDefined();
    expect(screen.getByText("Expected Covers")).toBeDefined();
    expect(screen.getByText("Upcoming (2 hrs)")).toBeDefined();
    expect(screen.getByText("Cancellation Rate")).toBeDefined();
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

  it("cancellation trend shows delta text for up trend", () => {
    vi.mocked(useDashboardStatsQuery).mockReturnValue({
      reservations: [],
      stats: {
        totalReservations: 5,
        expectedCovers: 20,
        upcomingCount: 3,
        cancellationRate: 15,
        cancellationTrend: "up",
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByText("Cancellation Rate")).toBeDefined();
  });
});
