import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { WaitlistPage } from "./WaitlistPage.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import { useWaitlist } from "../hooks/useWaitlist.js";
import type { WaitlistEntry } from "@mbe/types";
import React from "react";

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useWaitlist.js", () => ({ useWaitlist: vi.fn() }));

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
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="skeleton-group">{children}</div>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

const mockVenue: VenueContextValue = {
  selectedVenueId: "venue-abc",
  setSelectedVenueId: vi.fn(),
  venues: [],
  isLoading: false,
};

const makeEntry = (overrides: Partial<WaitlistEntry> = {}): WaitlistEntry => ({
  id: "wl-1",
  venueId: "venue-abc",
  partySize: 4,
  guestName: "Jane Doe",
  guestPhone: "+15551234567",
  position: 1,
  estimatedWaitMinutes: 15,
  status: "waiting",
  notifiedAt: null,
  expiresAt: null,
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
  ...overrides,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <WaitlistPage />
    </MemoryRouter>
  );
}

describe("WaitlistPage", () => {
  beforeEach(() => {
    vi.mocked(useVenue).mockReturnValue(mockVenue);
  });

  it("shows loading state", () => {
    vi.mocked(useWaitlist).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("skeleton-group")).toBeInTheDocument();
  });

  it("renders page title in header", () => {
    vi.mocked(useWaitlist).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("page-header")).toHaveTextContent("Waitlist");
  });

  it("shows empty state when no one is waiting", () => {
    vi.mocked(useWaitlist).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No one waiting");
  });

  it("shows error alert when fetch fails, without throwing", () => {
    vi.mocked(useWaitlist).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("alert")).toBeInTheDocument();
  });

  it("renders entries ordered by position with guest name, party size and wait", () => {
    const first = makeEntry({ id: "wl-1", position: 1, guestName: "Alice", partySize: 2 });
    const second = makeEntry({
      id: "wl-2",
      position: 2,
      guestName: "Bob",
      partySize: 5,
      estimatedWaitMinutes: 30,
    });
    // Return out of order — page must sort by position, not array order.
    vi.mocked(useWaitlist).mockReturnValue({
      data: [second, first],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    const names = screen.getAllByTestId("card").map((card) => card.textContent);
    expect(names[0]).toContain("Alice");
    expect(names[1]).toContain("Bob");
    expect(screen.getByText("Party of 2")).toBeInTheDocument();
    expect(screen.getByText("Party of 5")).toBeInTheDocument();
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });
});
