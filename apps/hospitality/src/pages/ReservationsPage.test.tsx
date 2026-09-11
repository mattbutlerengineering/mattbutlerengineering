import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { ReservationsPage } from "./ReservationsPage.js";

vi.mock("react-router", async () => ({
  ...(await vi.importActual("react-router")),
  useNavigate: vi.fn(),
}));
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import { useReservationDisplay } from "../hooks/useReservationDisplay.js";
import type { UseReservationDisplayResult } from "../hooks/useReservationDisplay.js";
import { useTables } from "../hooks/useTables.js";
import { useCreateReservation } from "../hooks/useReservations.js";
import type { Reservation, CreateReservationRequest } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";
import { ERROR_COPY } from "../lib/describe-api-error.js";
import { formatServiceDate } from "../utils/format.js";
import React from "react";

const today = new Date().toLocaleDateString("en-CA");

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useReservationDisplay.js", () => ({ useReservationDisplay: vi.fn() }));
vi.mock("../hooks/useTables.js", () => ({ useTables: vi.fn() }));
vi.mock("../hooks/useReservations.js", () => ({ useCreateReservation: vi.fn() }));

vi.mock("../components/PageHeader", () => ({
  // The real PageHeader's h1 carries tabIndex={-1} so `focusAfter({ kind: "pageHeading" })` lands.
  PageHeader: ({ title }: { title: string }) => (
    <div data-testid="page-header">
      <h1 tabIndex={-1}>{title}</h1>
    </div>
  ),
}));

vi.mock("../components/ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({
    title,
    error,
    details,
    onRetry,
  }: {
    title?: string;
    error: string;
    details?: string;
    onRetry?: () => void;
  }) => (
    <div role="alert" data-testid="error-banner">
      {title && <p data-testid="banner-title">{title}</p>}
      <p data-testid="banner-detail">{error}</p>
      {details && <div data-testid="banner-details">{details}</div>}
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  ),
}));

const NEW_RESERVATION_PAYLOAD: CreateReservationRequest = {
  date: "2026-01-15",
  startTime: "2026-01-15T18:00:00",
  endTime: "2026-01-15T19:30:00",
  partySize: 2,
  tableId: "table-1",
  venueId: "venue-1",
  guestName: "New Guest",
  guestEmail: "new-guest@example.com",
};

vi.mock("../components/reservations/NewReservationDialog.js", () => ({
  NewReservationDialog: ({
    onConfirm,
    onClose,
  }: {
    onConfirm: (data: CreateReservationRequest) => Promise<void>;
    onClose: () => void;
  }) => (
    <div data-testid="new-reservation-dialog">
      {/* Mirrors the real dialog's onFormSubmit: catch so a rejected
          onConfirm doesn't surface as an unhandled rejection in this stub —
          the real error-banner display is covered by
          NewReservationDialog.test.tsx. */}
      <button
        onClick={() => {
          onConfirm(NEW_RESERVATION_PAYLOAD).catch(() => {});
        }}
      >
        Confirm New Reservation
      </button>
      <button onClick={onClose}>Close New Reservation</button>
    </div>
  ),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
  // Takes `ref` like rialto's (forwardRef) Button does — React 19 passes it as a plain prop — so
  // the page can hand the toolbar button to useFocusAfter.
  Button: ({
    children,
    onClick,
    disabled,
    ref,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    ref?: React.Ref<HTMLButtonElement>;
  }) => (
    <button ref={ref} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  EmptyState: ({
    heading,
    description,
    action,
  }: {
    heading: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <span>{heading}</span>
      <span>{description}</span>
      {action}
    </div>
  ),
  Input: (props: {
    type?: string;
    placeholder?: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    "aria-label"?: string;
  }) => (
    <input
      data-testid={props.type === "date" ? "date-input" : "search-input"}
      type={props.type}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
      aria-label={props["aria-label"]}
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
  // Mirrors the real Stat: role="group" named by `label`, but an explicit aria-label prop wins.
  Stat: ({
    label,
    value,
    ...props
  }: {
    label: string;
    value: React.ReactNode;
    "aria-label"?: string;
  }) => (
    <div data-testid="stat" role="group" aria-label={props["aria-label"] ?? label}>
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
    refetch: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

const ZERO_STATS = { total: 0, confirmed: 0, pending: 0, cancelled: 0 };

/** A 500 the way `@mbe/api-client` raises it. */
function serverError(): ApiClientError {
  return new ApiClientError(
    {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "Internal Server Error",
    },
    "GET",
    "/api/v1/reservations"
  );
}

const KPI_LABELS = ["Total", "Confirmed", "Pending", "Cancelled"] as const;

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

const createReservationMutateAsync = vi.fn().mockResolvedValue(undefined);

const mockNavigate = vi.fn();

describe("ReservationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    mockDisplayHook();
    vi.mocked(useTables).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    createReservationMutateAsync.mockResolvedValue(undefined);
    vi.mocked(useCreateReservation).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: createReservationMutateAsync,
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ReservationsPage />
      </MemoryRouter>
    );

  /** Prints the live `location.search` so tests can see what the page left in the URL. */
  function LocationProbe() {
    const location = useLocation();
    return <span data-testid="location-search">{location.search}</span>;
  }

  const renderAt = (initialEntry: string) =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <ReservationsPage />
        <LocationProbe />
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

  it("exposes accessible names for the search and date filter inputs", () => {
    renderPage();
    expect(screen.getByLabelText("Search by guest name")).toBeDefined();
    expect(screen.getByLabelText("Filter by date")).toBeDefined();
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
    it("says the day is empty in service words, with New reservation as the action (ux.md Screen 8)", () => {
      mockDisplayHook({ data: [], stats: ZERO_STATS, filteredData: [] });

      renderPage();

      expect(screen.getByTestId("empty-state")).toBeDefined();
      expect(
        screen.getByText(`Nothing on the book for ${formatServiceDate(today)}.`)
      ).toBeDefined();
      expect(screen.getByText("New bookings show here as they land.")).toBeDefined();
      expect(screen.queryByText("No reservations")).toBeNull();

      // The action is a second "New reservation" button; it opens the same dialog.
      const actions = screen.getAllByRole("button", { name: "New reservation" });
      expect(actions).toHaveLength(2);
      fireEvent.click(actions[1]);
      expect(screen.getByTestId("new-reservation-dialog")).toBeDefined();
    });

    it("reads real zeros in the KPIs when the day is loaded and empty (never dashes)", () => {
      mockDisplayHook({ data: [], stats: ZERO_STATS, filteredData: [] });

      renderPage();

      for (const label of KPI_LABELS) {
        expect(screen.getByRole("group", { name: label })).toHaveTextContent("0");
      }
      expect(screen.queryByRole("group", { name: /unavailable/ })).toBeNull();
    });

    it("keeps the filter empty state when the day has bookings but none match", () => {
      mockDisplayHook({ filteredData: [] });

      renderPage();

      expect(screen.getByText("No reservations")).toBeDefined();
      expect(screen.queryByText(/^Nothing on the book for /)).toBeNull();
    });

    it("formats the filter empty-state date with the service-date formatter, not as raw ISO", () => {
      mockDisplayHook({ filteredData: [] });

      renderAt("/reservations?status=CONFIRMED");

      const empty = screen.getByTestId("empty-state");
      expect(empty).toHaveTextContent(
        `No confirmed reservations found for ${formatServiceDate(today)}.`
      );
      expect(empty).not.toHaveTextContent(today);
    });

    it("offers an action inside the empty state that opens the New reservation dialog", () => {
      mockDisplayHook({
        data: [],
        stats: { total: 0, confirmed: 0, pending: 0, cancelled: 0 },
        filteredData: [],
      });

      renderPage();

      const empty = screen.getByTestId("empty-state");
      const actionButton = within(empty).getByRole("button");
      fireEvent.click(actionButton);

      expect(screen.getByTestId("new-reservation-dialog")).toBeDefined();
    });
  });

  describe("loading state", () => {
    it("shows five skeleton rows inside one busy status region that says what is loading", () => {
      mockDisplayHook({ data: undefined, stats: ZERO_STATS, filteredData: [], isLoading: true });

      renderPage();

      const region = screen.getByText("Loading reservations…").closest("[role='status']");
      expect(region).not.toBeNull();
      expect(region).toHaveAttribute("aria-busy", "true");
      expect(screen.getAllByTestId("skeleton")).toHaveLength(5);
      // The page shell (heading, toolbar) stays up while rows load.
      expect(screen.getByRole("heading", { level: 1, name: "Reservations" })).toBeDefined();
      expect(screen.getByLabelText("Filter by date")).toBeDefined();
    });

    it("renders the KPIs as dashes spoken as unavailable while loading — never 0", () => {
      mockDisplayHook({ data: undefined, stats: ZERO_STATS, filteredData: [], isLoading: true });

      renderPage();

      for (const label of KPI_LABELS) {
        const group = screen.getByRole("group", { name: `${label}, unavailable` });
        expect(group).toHaveTextContent("—");
        expect(group).not.toHaveTextContent("0");
      }
    });
  });

  describe("error handling (500 → banner + Retry, S13/S14)", () => {
    const failed = () =>
      mockDisplayHook({
        data: undefined,
        stats: ZERO_STATS,
        filteredData: [],
        error: serverError(),
      });

    it("shows one titled banner with the house sentence and the raw line demoted to details", () => {
      failed();

      renderPage();

      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getByTestId("banner-title")).toHaveTextContent("Couldn't load reservations.");
      expect(screen.getByTestId("banner-detail")).toHaveTextContent(ERROR_COPY.serverError.detail);
      expect(screen.getByTestId("banner-details")).toHaveTextContent(
        "GET /api/v1/reservations failed: 500 Internal Server Error"
      );
      expect(screen.getByTestId("banner-detail")).not.toHaveTextContent("failed: 500");
    });

    it("keeps the KPIs as dashes spoken as unavailable, renders no rows and no empty state", () => {
      failed();

      renderPage();

      for (const label of KPI_LABELS) {
        expect(screen.getByRole("group", { name: `${label}, unavailable` })).toHaveTextContent("—");
      }
      expect(screen.queryAllByRole("row")).toHaveLength(0);
      expect(screen.queryByTestId("empty-state")).toBeNull();
      expect(screen.queryByTestId("skeleton")).toBeNull();
    });

    it("leaves New reservation enabled beside the banner", () => {
      failed();

      renderPage();

      expect(screen.getByRole("button", { name: "New reservation" })).toBeEnabled();
    });

    it("Retry refetches; on success the rows and KPIs fill, the page speaks, and focus moves to the heading", async () => {
      const refetch = vi.fn().mockResolvedValue({ error: null });
      mockDisplayHook({
        data: undefined,
        stats: ZERO_STATS,
        filteredData: [],
        error: serverError(),
        refetch,
      });

      renderPage();
      expect(screen.getByRole("alert")).toBeDefined();

      // The next render (after Retry resolves) sees the recovered query.
      mockDisplayHook({ refetch });
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));

      await waitFor(() => {
        expect(refetch).toHaveBeenCalledOnce();
        expect(screen.queryByRole("alert")).toBeNull();
      });
      expect(screen.getAllByRole("row")).toHaveLength(4);
      expect(screen.getByRole("group", { name: "Total" })).toHaveTextContent("3");
      expect(screen.queryByRole("group", { name: /unavailable/ })).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent(
        `Reservations for ${formatServiceDate(today)} loaded.`
      );
      await waitFor(() => {
        expect(screen.getByRole("heading", { level: 1, name: "Reservations" })).toHaveFocus();
      });
    });

    it("a Retry that fails again stays silent and leaves focus alone", async () => {
      const refetch = vi.fn().mockResolvedValue({ error: new Error("still down") });
      mockDisplayHook({
        data: undefined,
        stats: ZERO_STATS,
        filteredData: [],
        error: serverError(),
        refetch,
      });

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));

      await waitFor(() => expect(refetch).toHaveBeenCalledOnce());
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("status")).toHaveTextContent("");
      expect(screen.getByRole("heading", { level: 1, name: "Reservations" })).not.toHaveFocus();
    });
  });

  describe("new reservation flow", () => {
    it("shows a New reservation action", () => {
      renderPage();
      expect(screen.getByText("New reservation")).toBeDefined();
    });

    it("opens the new reservation dialog on click", () => {
      renderPage();

      expect(screen.queryByTestId("new-reservation-dialog")).toBeNull();
      fireEvent.click(screen.getByText("New reservation"));

      expect(screen.getByTestId("new-reservation-dialog")).toBeDefined();
    });

    it("creates a reservation end-to-end and closes the dialog on confirm", async () => {
      renderPage();

      fireEvent.click(screen.getByText("New reservation"));
      fireEvent.click(screen.getByText("Confirm New Reservation"));

      await waitFor(() => {
        expect(createReservationMutateAsync).toHaveBeenCalledWith(NEW_RESERVATION_PAYLOAD);
      });

      await waitFor(() => {
        expect(screen.queryByTestId("new-reservation-dialog")).toBeNull();
      });
    });

    it("closes the dialog without creating when closed", () => {
      renderPage();

      fireEvent.click(screen.getByText("New reservation"));
      expect(screen.getByTestId("new-reservation-dialog")).toBeDefined();

      fireEvent.click(screen.getByText("Close New Reservation"));

      expect(screen.queryByTestId("new-reservation-dialog")).toBeNull();
      expect(createReservationMutateAsync).not.toHaveBeenCalled();
    });

    it("leaves the dialog open when the create mutation rejects", async () => {
      createReservationMutateAsync.mockRejectedValueOnce(new Error("Table is not available"));
      renderPage();

      fireEvent.click(screen.getByText("New reservation"));
      fireEvent.click(screen.getByText("Confirm New Reservation"));

      await waitFor(() => {
        expect(createReservationMutateAsync).toHaveBeenCalledOnce();
      });

      // Dialog stays open — its own internal error banner (tested in
      // NewReservationDialog.test.tsx) surfaces the ADR-002/008 envelope
      // message; the page only closes on success.
      expect(screen.getByTestId("new-reservation-dialog")).toBeDefined();
    });

    it("disables the New reservation button when no venue is selected", () => {
      vi.mocked(useVenue).mockReturnValue(makeVenueContext({ selectedVenueId: null }));
      renderPage();

      expect(screen.getByText("New reservation").closest("button")).toBeDisabled();
    });
  });

  describe("⌘K intent — /reservations?new=true opens the dialog (architecture § Amendment 2026-09-04)", () => {
    it("renders the New Reservation dialog from the URL once tables have loaded", () => {
      renderAt("/reservations?new=true");
      expect(screen.getByTestId("new-reservation-dialog")).toBeDefined();
    });

    it("waits for the tables query — no dialog while useTables is loading (the dialog seeds its table once, at mount)", () => {
      vi.mocked(useTables).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });
      renderAt("/reservations?new=true");
      expect(screen.queryByTestId("new-reservation-dialog")).toBeNull();
    });

    it("closing without creating strips `new` from the URL (other params intact) and lands focus on the New reservation button", async () => {
      renderAt("/reservations?new=true&status=CONFIRMED");
      expect(screen.getByTestId("new-reservation-dialog")).toBeDefined();

      fireEvent.click(screen.getByText("Close New Reservation"));

      expect(screen.queryByTestId("new-reservation-dialog")).toBeNull();
      expect(screen.getByTestId("location-search").textContent).toBe("?status=CONFIRMED");
      await waitFor(() => {
        expect(document.activeElement).toBe(
          screen.getByRole("button", { name: "New reservation" })
        );
      });
      expect(createReservationMutateAsync).not.toHaveBeenCalled();
    });

    it("a confirmed create strips `new` and lands focus on the page heading", async () => {
      renderAt("/reservations?new=true");
      fireEvent.click(screen.getByText("Confirm New Reservation"));

      await waitFor(() => {
        expect(createReservationMutateAsync).toHaveBeenCalledWith(NEW_RESERVATION_PAYLOAD);
      });
      await waitFor(() => {
        expect(screen.queryByTestId("new-reservation-dialog")).toBeNull();
      });
      expect(screen.getByTestId("location-search").textContent).toBe("");
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
      });
    });

    it("no venue: no dialog, and the intent stays in the URL for when a venue is selected", () => {
      vi.mocked(useVenue).mockReturnValue(makeVenueContext({ selectedVenueId: null }));
      renderAt("/reservations?new=true");
      expect(screen.queryByTestId("new-reservation-dialog")).toBeNull();
      expect(screen.getByTestId("location-search").textContent).toBe("?new=true");
    });
  });

  describe("row semantics and navigation", () => {
    it("preserves native row role on table rows (header + one per reservation)", () => {
      renderPage();

      // If a <tr> carries role="button" it stops being exposed as a "row" —
      // this only resolves to 4 (1 header + 3 reservations) once the rows
      // are plain <tr> elements again.
      expect(screen.getAllByRole("row")).toHaveLength(4);
    });

    it("exposes a per-row activation control distinct from the row itself", () => {
      renderPage();

      const activationButton = screen.getByRole("button", {
        name: "View Alice reservation on timeline",
      });
      expect(activationButton.tagName).toBe("BUTTON");
      expect(activationButton.closest("tr")).not.toBeNull();
    });

    it("navigates to the timeline on clicking the row's activation control", () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "View Alice reservation on timeline" }));

      expect(mockNavigate).toHaveBeenCalledWith(`/timeline?date=${defaultReservations[0].date}`);
    });

    it("navigates to the timeline on Enter from the row's activation control", () => {
      renderPage();

      fireEvent.keyDown(screen.getByRole("button", { name: "View Bob reservation on timeline" }), {
        key: "Enter",
      });

      expect(mockNavigate).toHaveBeenCalledWith(`/timeline?date=${defaultReservations[1].date}`);
    });
  });
});
