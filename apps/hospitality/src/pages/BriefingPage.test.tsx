import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BriefingPage } from "./BriefingPage.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import { useBriefing } from "../hooks/useBriefing.js";
import type { UseBriefingResult } from "../hooks/useBriefing.js";
import { useReservationEvents } from "../hooks/useReservationEvents.js";
import type { BriefingResponse, BriefingReservation } from "@mbe/api-client";
import React from "react";

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useBriefing.js", () => ({ useBriefing: vi.fn() }));
vi.mock("../hooks/useReservationEvents.js", () => ({
  useReservationEvents: vi.fn().mockReturnValue({ isConnected: false, error: null, reconnect: vi.fn() }),
}));

vi.mock("../components/PageHeader.js", () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div data-testid="alert">{children}</div>,
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  EmptyState: ({
    heading,
    description,
  }: {
    heading: React.ReactNode;
    description?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <span>{heading}</span>
      {description && <span>{description}</span>}
    </div>
  ),
  Input: (props: {
    type?: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    placeholder?: string;
    "aria-label"?: string;
  }) => (
    <input
      data-testid={props.type === "date" ? "date-input" : "time-input"}
      type={props.type}
      value={props.value}
      onChange={props.onChange}
      placeholder={props.placeholder}
      aria-label={props["aria-label"]}
    />
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="skeleton-group">{children}</div>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

/* ── Helpers ─────────────────────────────────── */

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

function makeReservation(overrides: Partial<BriefingReservation> = {}): BriefingReservation {
  return {
    id: "res-1",
    startTime: "2026-05-26T18:00:00.000Z",
    endTime: "2026-05-26T19:30:00.000Z",
    partySize: 2,
    status: "CONFIRMED",
    notes: null,
    occasion: null,
    seatingPreference: null,
    guestName: "Jane Smith",
    tableId: "table-1",
    tableName: "Table 1",
    venueId: "venue-1",
    guest: null,
    ...overrides,
  };
}

function makeBriefingResult(overrides: Partial<UseBriefingResult> = {}): UseBriefingResult {
  return {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

function makeBriefingData(reservations: BriefingReservation[]): BriefingResponse {
  return {
    date: "2026-05-26",
    venueId: "venue-1",
    reservations,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BriefingPage />
    </MemoryRouter>
  );
}

/* ── Tests ─────────────────────────────────── */

describe("BriefingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useBriefing).mockReturnValue(makeBriefingResult());
    vi.mocked(useReservationEvents).mockReturnValue({
      isConnected: false,
      error: null,
      reconnect: vi.fn(),
    });
  });

  it("renders page header", () => {
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ data: makeBriefingData([]) })
    );
    renderPage();
    expect(screen.getByTestId("page-header")).toBeInTheDocument();
  });

  it("shows loading skeleton while data is loading", () => {
    vi.mocked(useBriefing).mockReturnValue(makeBriefingResult({ isLoading: true }));
    renderPage();
    expect(screen.getByTestId("skeleton-group")).toBeInTheDocument();
  });

  it("shows empty state when no reservations", () => {
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ data: makeBriefingData([]) })
    );
    renderPage();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders reservation cards", () => {
    const reservations = [
      makeReservation({ id: "res-1", guestName: "Alice" }),
      makeReservation({ id: "res-2", guestName: "Bob", startTime: "2026-05-26T19:00:00.000Z" }),
    ];
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ data: makeBriefingData(reservations) })
    );
    renderPage();
    expect(screen.getAllByTestId("card")).toHaveLength(2);
  });

  it("groups reservations by time slot", () => {
    const reservations = [
      makeReservation({ id: "res-1", startTime: "2026-05-26T18:00:00.000Z" }),
      makeReservation({ id: "res-2", startTime: "2026-05-26T18:15:00.000Z" }), // same 18:00 slot
      makeReservation({ id: "res-3", startTime: "2026-05-26T19:00:00.000Z" }), // different slot
    ];
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ data: makeBriefingData(reservations) })
    );
    renderPage();
    // Should have 2 time slot sections (18:00 and 19:00)
    expect(screen.getAllByTestId("time-slot")).toHaveLength(2);
  });

  it("displays guest CRM data when guest is present", () => {
    const reservations = [
      makeReservation({
        id: "res-1",
        guest: {
          id: "guest-1",
          name: "Jane Smith",
          email: "jane@example.com",
          phone: null,
          visitCount: 5,
          lastVisit: "2026-04-01T19:00:00.000Z",
          dietaryRestrictions: ["gluten-free"],
          tags: ["VIP"],
          staffNotes: [{ text: "Prefers quiet corner", createdBy: "staff", createdAt: "2026-01-01T00:00:00Z" }],
        },
      }),
    ];
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ data: makeBriefingData(reservations) })
    );
    renderPage();
    expect(screen.getByText("gluten-free")).toBeInTheDocument();
    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getByText("Prefers quiet corner")).toBeInTheDocument();
  });

  it("shows occasion badge when occasion is set", () => {
    const reservations = [
      makeReservation({ id: "res-1", occasion: "anniversary" }),
    ];
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ data: makeBriefingData(reservations) })
    );
    renderPage();
    expect(screen.getByText("Anniversary")).toBeInTheDocument();
  });

  it("shows error alert on failure", () => {
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ error: new Error("API error") })
    );
    renderPage();
    expect(screen.getByTestId("alert")).toBeInTheDocument();
  });

  it("subscribes to SSE events for real-time updates", () => {
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ data: makeBriefingData([]) })
    );
    renderPage();
    expect(useReservationEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: "venue-1",
        onReservationCreated: expect.any(Function),
        onReservationUpdated: expect.any(Function),
        onReservationCancelled: expect.any(Function),
      })
    );
  });

  it("renders date input for navigation", () => {
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ data: makeBriefingData([]) })
    );
    renderPage();
    expect(screen.getByTestId("date-input")).toBeInTheDocument();
  });

  it("shows dietary allergy badges highlighted on card", () => {
    const reservations = [
      makeReservation({
        id: "res-1",
        guest: {
          id: "guest-1",
          name: "Celiac Guest",
          email: null,
          phone: null,
          visitCount: 1,
          lastVisit: null,
          dietaryRestrictions: ["gluten-free", "dairy-free"],
          tags: null,
          staffNotes: [],
        },
      }),
    ];
    vi.mocked(useBriefing).mockReturnValue(
      makeBriefingResult({ data: makeBriefingData(reservations) })
    );
    renderPage();
    expect(screen.getByText("gluten-free")).toBeInTheDocument();
    expect(screen.getByText("dairy-free")).toBeInTheDocument();
  });
});
