import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BriefingPage } from "./BriefingPage.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import { useBriefing } from "../hooks/useBriefing.js";
import React from "react";

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useBriefing.js", () => ({ useBriefing: vi.fn() }));
vi.mock("../hooks/useSSESync.tsx", () => ({
  useSSEEventFeed: vi.fn(() => []),
  useSSEStatus: vi.fn(() => ({ isConnected: false, error: null })),
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div data-testid="alert">{children}</div>,
  Badge: ({
    children,
    variant,
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
  }) => <span data-testid={`badge-${variant ?? "default"}`}>{children}</span>,
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
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tag: ({ children }: { children: React.ReactNode }) => <span data-testid="tag">{children}</span>,
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

const today = new Date().toLocaleDateString("en-CA");

const makeEntry = (overrides = {}) => ({
  id: "res-1",
  date: `${today}T00:00:00.000Z`,
  startTime: `${today}T18:00:00.000Z`,
  endTime: `${today}T20:00:00.000Z`,
  partySize: 4,
  status: "CONFIRMED" as const,
  notes: "Window table please",
  cancellationReason: null,
  cancellationNote: null,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: null,
  guestId: "guest-1",
  userId: null,
  occasion: null,
  seatingPreference: null,
  tableId: "table-1",
  table: { id: "table-1", name: "Table 5", tableNumber: "5" },
  venueId: "venue-abc",
  createdAt: `${today}T00:00:00.000Z`,
  updatedAt: `${today}T00:00:00.000Z`,
  guest: {
    id: "guest-1",
    name: "Jane Doe",
    visitCount: 3,
    lastVisit: "2026-06-01",
    dietaryRestrictions: ["gluten-free"],
    notes: "Regular",
    staffNotes: [],
    tags: ["VIP"],
    communicationPreference: "email_only",
  },
  ...overrides,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <BriefingPage />
    </MemoryRouter>
  );
}

describe("BriefingPage", () => {
  beforeEach(() => {
    vi.mocked(useVenue).mockReturnValue(mockVenue);
  });

  it("shows loading state", () => {
    vi.mocked(useBriefing).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("skeleton-group")).toBeInTheDocument();
  });

  it("renders page title in header", () => {
    vi.mocked(useBriefing).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("page-header")).toHaveTextContent("Tonight's Service");
  });

  it("shows empty state when no reservations", () => {
    vi.mocked(useBriefing).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders reservation cards with guest info", () => {
    const entry = makeEntry();
    vi.mocked(useBriefing).mockReturnValue({
      data: [entry],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("4 covers")).toBeInTheDocument(); // party size badge
  });

  it("highlights dietary restrictions when present", () => {
    const entry = makeEntry({
      guest: { ...makeEntry().guest, dietaryRestrictions: ["nut-allergy"] },
    });
    vi.mocked(useBriefing).mockReturnValue({
      data: [entry],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByText("nut-allergy")).toBeInTheDocument();
  });

  it("shows visit count when available", () => {
    const entry = makeEntry();
    vi.mocked(useBriefing).mockReturnValue({
      data: [entry],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByText(/3rd visit/i)).toBeInTheDocument();
  });

  it("shows error alert when fetch fails", () => {
    vi.mocked(useBriefing).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
      refetch: vi.fn(),
    });

    renderPage();
    expect(screen.getByTestId("alert")).toBeInTheDocument();
  });

  it("time slot filter narrows displayed entries", () => {
    const earlyEntry = makeEntry({
      id: "res-early",
      startTime: `${today}T17:00:00.000Z`,
      guestName: "Early Guest",
    });
    const lateEntry = makeEntry({
      id: "res-late",
      startTime: `${today}T21:00:00.000Z`,
      guestName: "Late Guest",
    });

    vi.mocked(useBriefing).mockReturnValue({
      data: [earlyEntry, lateEntry],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    // Initially both visible
    expect(screen.getByText("Early Guest")).toBeInTheDocument();
    expect(screen.getByText("Late Guest")).toBeInTheDocument();

    // Filter to early slot (first segment after "all")
    const earlyButton = screen.getByTestId("segment-early");
    fireEvent.click(earlyButton);

    expect(screen.getByText("Early Guest")).toBeInTheDocument();
    expect(screen.queryByText("Late Guest")).not.toBeInTheDocument();
  });
});
