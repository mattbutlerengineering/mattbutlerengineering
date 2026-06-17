import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestsPage } from "./GuestsPage.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import type { Venue, Guest, GuestSegment } from "@mbe/types";
import { useReservations } from "../hooks/useReservations.js";
import type { UseReservationsResult } from "../hooks/useReservations.js";
import type { UseGuestDirectoryResult } from "../hooks/useGuestDirectory.js";
import React from "react";

/* ── Module mocks ─────────────────────────── */

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../hooks/useReservations.js", () => ({ useReservations: vi.fn() }));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title, description }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <span>{description}</span>
    </div>
  ),
}));

vi.mock("../components/ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({ error }: any) => <div data-testid="error-banner">{error}</div>,
}));

vi.mock("../components/crm/GuestCard.js", () => ({
  GuestCard: ({ guestId }: any) => <div data-testid="guest-card" data-guest-id={guestId} />,
}));

const mockToast = vi.fn();

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Button: ({ children, onClick, disabled, type }: any) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children, title }: any) => (
    <div data-testid="card">
      {title}
      {children}
    </div>
  ),
  Checkbox: ({ label, checked, onCheckedChange }: any) => (
    <label>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked ?? false}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
      {label}
    </label>
  ),
  Dialog: ({ children, open, title, footer }: any) =>
    open ? (
      <div data-testid="dialog">
        <h1>{title}</h1>
        {children}
        {footer}
      </div>
    ) : null,
  Divider: () => <hr />,
  Drawer: ({ children, open, footer }: any) =>
    open ? (
      <div data-testid="drawer">
        {children}
        {footer}
      </div>
    ) : null,
  EmptyState: ({ heading, description }: any) => (
    <div data-testid="empty-state">
      <span>{heading}</span>
      <span>{description}</span>
    </div>
  ),
  Input: (props: any) => {
    const id = props.label?.replace(/\s+/g, "-").toLowerCase() || "input";
    return (
      <div>
        {props.label && <label htmlFor={id}>{props.label}</label>}
        <input
          id={id}
          type={props.type}
          value={props.value ?? ""}
          onChange={props.onChange}
          onKeyDown={props.onKeyDown}
          placeholder={props.placeholder}
        />
        {props.error && props.hint && <span data-testid={`input-error-${id}`}>{props.hint}</span>}
      </div>
    );
  },
  Select: (props: any) => (
    <select
      data-testid={`select-${props.label}`}
      value={props.value}
      onChange={(e) => props.onChange?.(e.target.value)}
    >
      {props.options?.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Stat: ({ label, value }: any) => (
    <div data-testid="stat">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  Tag: ({ children }: any) => <span data-testid="tag">{children}</span>,
  Text: ({ children }: any) => <span>{children}</span>,
  TextArea: (props: any) => (
    <textarea data-testid="textarea" value={props.value} onChange={(e) => props.onChange?.(e)} />
  ),
  useToast: () => ({ toast: mockToast }),
}));

/* ── Factory helpers ─────────────────────── */

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "venue-1",
    venueGroupId: null,
    name: "Test Venue",
    slug: "test-venue",
    ianaTimezone: "America/New_York",
    currencyCode: "USD",
    operatingHours: null,
    settings: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeVenueContext(overrides: Partial<VenueContextValue> = {}): VenueContextValue {
  return {
    selectedVenueId: "venue-1",
    venues: [makeVenue()],
    selectedVenue: makeVenue(),
    setVenueId: vi.fn(),
    isLoading: false,
    isMultiVenue: false,
    refetchVenues: vi.fn(),
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g1",
    name: "John Doe",
    email: "john@example.com",
    phone: "+15551234",
    visitCount: 5,
    notes: null,
    tags: [],
    dietaryRestrictions: [],
    lastVisit: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    venueId: "venue-1",
    lifetimeSpend: null,
    ...overrides,
  };
}

function makeSegment(overrides: Partial<GuestSegment> = {}): GuestSegment {
  return { name: "VIP", count: 5, ...overrides };
}

function makeDirectoryResult(
  overrides: Partial<UseGuestDirectoryResult> = {}
): UseGuestDirectoryResult {
  return {
    guests: [],
    segments: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    isSearchActive: false,
    selectedGuestId: null,
    selectedGuest: null,
    selectGuest: vi.fn(),
    clearSelection: vi.fn(),
    addGuest: vi.fn().mockResolvedValue(undefined),
    updateGuest: vi.fn().mockResolvedValue(undefined),
    isAddingGuest: false,
    isUpdatingGuest: false,
    ...overrides,
  };
}

function makeReservationsResult(
  overrides: Partial<UseReservationsResult> = {}
): UseReservationsResult {
  return {
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

/* ── Render helper ────────────────────────── */

function renderPage(
  directoryOverrides: Partial<UseGuestDirectoryResult> = {},
  venueOverrides: Partial<VenueContextValue> = {}
) {
  const directory = makeDirectoryResult(directoryOverrides);
  vi.mocked(useVenue).mockReturnValue(makeVenueContext(venueOverrides));
  vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

  return render(<GuestsPage _useGuestDirectory={() => directory} />);
}

/* ── Test suites ──────────────────────────── */

describe("GuestsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page header", () => {
    renderPage({ guests: [makeGuest()] });
    expect(screen.getByText("Guests")).toBeDefined();
  });

  it("shows loading skeleton state", () => {
    renderPage({ isLoading: true, guests: [] });
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders guest list", () => {
    renderPage({
      guests: [makeGuest(), makeGuest({ id: "g2", name: "Jane Smith" })],
    });
    expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0);
  });

  it("renders segment stats", () => {
    renderPage({
      guests: [makeGuest()],
      segments: [makeSegment({ name: "VIP", count: 5 })],
    });
    expect(screen.getByText("VIP")).toBeDefined();
  });

  it("shows error banner when error is present", () => {
    renderPage({ error: new Error("Connection failed"), guests: [] });
    expect(screen.getByTestId("error-banner")).toBeDefined();
    expect(screen.getByText("Connection failed")).toBeDefined();
  });

  it("shows Add Guest button", () => {
    renderPage({ guests: [makeGuest()] });
    expect(screen.getByText("Add Guest")).toBeDefined();
  });

  it("opens add guest dialog when button is clicked", async () => {
    renderPage({ guests: [makeGuest()] });
    fireEvent.click(screen.getByText("Add Guest"));
    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });
  });
});

describe("GuestsPage - search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls setSearchQuery when typing in search input", async () => {
    const setSearchQuery = vi.fn();
    const user = userEvent.setup();

    const directory = makeDirectoryResult({
      guests: [makeGuest()],
      setSearchQuery,
    });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    const searchInput = screen.getByPlaceholderText("Search guests...");
    await user.type(searchInput, "J");

    expect(setSearchQuery).toHaveBeenCalled();
  });

  it("shows search-specific empty state when isSearchActive", () => {
    renderPage({ guests: [], isSearchActive: true, searchQuery: "zzz" });
    expect(screen.getByText("No guests found")).toBeDefined();
    expect(screen.getByText("Try adjusting your search query.")).toBeDefined();
  });

  it("shows default empty state when no search active", () => {
    renderPage({ guests: [], isSearchActive: false, searchQuery: "" });
    expect(screen.getByText("No guests yet")).toBeDefined();
  });
});

describe("GuestsPage - segment stats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a stat card for each segment", () => {
    renderPage({
      guests: [makeGuest()],
      segments: [
        makeSegment({ name: "VIP", count: 5 }),
        makeSegment({ name: "Regular", count: 10 }),
        makeSegment({ name: "New", count: 3 }),
      ],
    });
    const stats = screen.getAllByTestId("stat");
    expect(stats.length).toBe(3);
  });

  it("shows result count text with total from segments", () => {
    renderPage({
      guests: [makeGuest()],
      segments: [
        makeSegment({ name: "VIP", count: 5 }),
        makeSegment({ name: "Regular", count: 10 }),
        makeSegment({ name: "New", count: 3 }),
      ],
    });
    expect(screen.getByText("Showing 1 of 18 guests")).toBeDefined();
  });
});

describe("GuestsPage - guest detail drawer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens drawer when clicking a guest row", () => {
    const selectGuest = vi.fn();
    const directory = makeDirectoryResult({
      guests: [makeGuest()],
      selectGuest,
    });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    const row = screen.getByRole("button", {
      name: "View details for John Doe",
    });
    fireEvent.click(row);

    expect(selectGuest).toHaveBeenCalledWith("g1");
  });

  it("renders drawer when selectedGuest is set", () => {
    const guest = makeGuest({
      notes: "Prefers window seat",
      tags: ["vip", "regular"],
    });
    renderPage({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
    });
    expect(screen.getByTestId("drawer")).toBeDefined();
  });

  it("displays guest notes in the table row", () => {
    const guest = makeGuest({ notes: "Prefers window seat" });
    renderPage({ guests: [guest] });
    expect(screen.getAllByText("Prefers window seat").length).toBeGreaterThan(0);
  });

  it("fetches reservation history when selectedGuestId is set", () => {
    renderPage({
      guests: [makeGuest()],
      selectedGuestId: "g1",
      selectedGuest: makeGuest(),
    });
    expect(vi.mocked(useReservations)).toHaveBeenCalledWith(
      expect.objectContaining({ guestId: "g1", enabled: true })
    );
  });

  it("calls clearSelection when drawer closes", async () => {
    const clearSelection = vi.fn();
    const guest = makeGuest();
    const directory = makeDirectoryResult({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
      clearSelection,
    });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    expect(screen.getByTestId("drawer")).toBeDefined();
    fireEvent.click(screen.getByText("Close"));

    expect(clearSelection).toHaveBeenCalled();
  });

  it("calls updateGuest when saving edited guest", async () => {
    const updateGuest = vi.fn().mockResolvedValue(undefined);
    const guest = makeGuest();
    const directory = makeDirectoryResult({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
      updateGuest,
    });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(updateGuest).toHaveBeenCalledWith("g1", expect.objectContaining({ name: "John Doe" }));
    });
  });

  it("opens drawer via keyboard Enter on guest row", () => {
    const selectGuest = vi.fn();
    const directory = makeDirectoryResult({
      guests: [makeGuest()],
      selectGuest,
    });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    const row = screen.getByRole("button", {
      name: "View details for John Doe",
    });
    fireEvent.keyDown(row, { key: "Enter" });

    expect(selectGuest).toHaveBeenCalledWith("g1");
  });
});

describe("GuestsPage - add guest dialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls addGuest when form is submitted", async () => {
    const addGuest = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const directory = makeDirectoryResult({ guests: [], addGuest });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    fireEvent.click(screen.getByText("Add Guest"));
    await waitFor(() => expect(screen.getByTestId("dialog")).toBeDefined());

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, "New Guest");

    const buttons = screen.getAllByText("Add Guest");
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(addGuest).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New Guest", venueId: "venue-1" })
      );
    });
  });

  it("disables submit button when name is empty", async () => {
    renderPage({ guests: [] });

    fireEvent.click(screen.getByText("Add Guest"));
    await waitFor(() => expect(screen.getByTestId("dialog")).toBeDefined());

    const buttons = screen.getAllByText("Add Guest");
    const submitButton = buttons[buttons.length - 1];
    expect(submitButton.getAttribute("disabled")).not.toBeNull();
  });

  it("closes dialog on successful add", async () => {
    const addGuest = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const directory = makeDirectoryResult({ guests: [], addGuest });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    fireEvent.click(screen.getByText("Add Guest"));
    await waitFor(() => expect(screen.getByTestId("dialog")).toBeDefined());

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, "New Guest");

    const buttons = screen.getAllByText("Add Guest");
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByTestId("dialog")).toBeNull();
    });
  });

  it("shows error when add guest fails", async () => {
    const addGuest = vi.fn().mockRejectedValue(new Error("Duplicate guest"));
    const user = userEvent.setup();
    const directory = makeDirectoryResult({ guests: [], addGuest });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    fireEvent.click(screen.getByText("Add Guest"));
    await waitFor(() => expect(screen.getByTestId("dialog")).toBeDefined());

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, "Dupe Guest");

    const buttons = screen.getAllByText("Add Guest");
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Duplicate guest")).toBeDefined();
    });
  });

  it("closes dialog when Cancel is clicked", async () => {
    renderPage({ guests: [] });

    fireEvent.click(screen.getByText("Add Guest"));
    await waitFor(() => expect(screen.getByTestId("dialog")).toBeDefined());

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("dialog")).toBeNull();
    });
  });
});

describe("GuestsPage - empty state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows empty state when no guests exist", () => {
    renderPage({ guests: [], isSearchActive: false });
    expect(screen.getByTestId("empty-state")).toBeDefined();
    expect(screen.getByText("No guests yet")).toBeDefined();
  });
});

describe("GuestsPage - error retry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("displays the error message from failed query", () => {
    renderPage({ error: new Error("Network timeout"), guests: [] });
    expect(screen.getByTestId("error-banner")).toBeDefined();
    expect(screen.getByText("Network timeout")).toBeDefined();
  });
});

describe("GuestsPage - no venue selected", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows venue selection warning when no venue is selected", () => {
    vi.mocked(useVenue).mockReturnValue(
      makeVenueContext({
        selectedVenueId: null,
        venues: [],
        selectedVenue: null,
      })
    );
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    const directory = makeDirectoryResult({ guests: [], isLoading: false });
    render(<GuestsPage _useGuestDirectory={() => directory} />);

    expect(screen.getByText("Please select a venue to view guests.")).toBeDefined();
  });
});

describe("GuestsPage - guest table content", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders guest email and phone in the table", () => {
    renderPage({
      guests: [makeGuest({ email: "john@example.com", phone: "+15551234" })],
      segments: [makeSegment({ name: "VIP", count: 5 })],
    });
    expect(screen.getAllByText("john@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+15551234").length).toBeGreaterThan(0);
  });

  it("renders guest tags in the table", () => {
    renderPage({ guests: [makeGuest({ tags: ["vip"] })] });
    expect(screen.getAllByTestId("tag").length).toBeGreaterThan(0);
  });

  it("renders visit count in the table", () => {
    renderPage({ guests: [makeGuest({ visitCount: 5 })] });
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
  });

  it("renders guest notes as caption text in the table row", () => {
    renderPage({ guests: [makeGuest({ notes: "Window seat" })] });
    expect(screen.getByText("Window seat")).toBeDefined();
  });

  it("renders table headers", () => {
    renderPage({ guests: [makeGuest()] });
    expect(screen.getByText("Guest")).toBeDefined();
    expect(screen.getByText("Contact")).toBeDefined();
    expect(screen.getAllByText("Visits").length).toBeGreaterThan(0);
    expect(screen.getByText("Last Visit")).toBeDefined();
    expect(screen.getByText("Tags")).toBeDefined();
  });

  it("shows accessible guest count status text", () => {
    renderPage({
      guests: [makeGuest(), makeGuest({ id: "g2", name: "Jane" })],
    });
    expect(screen.getByText("2 guests shown")).toBeDefined();
  });
});

describe("GuestsPage - multi-venue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not show a venue selector (venue switching is sidebar-only)", () => {
    renderPage(
      { guests: [makeGuest()] },
      {
        selectedVenueId: "venue-1",
        venues: [makeVenue(), makeVenue({ id: "venue-2", name: "Uptown" })],
        isMultiVenue: true,
      }
    );
    expect(screen.queryByTestId("select-Venue")).toBeNull();
  });
});

describe("GuestsPage - tags editing in drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
  });

  it("shows tags input in edit mode", async () => {
    const guest = makeGuest({ tags: ["vip", "regular"] });
    renderPage({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
    });

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    expect(screen.getByPlaceholderText(/add tag/i)).toBeDefined();
  });

  it("includes tags in the update API call", async () => {
    const updateGuest = vi.fn().mockResolvedValue(undefined);
    const guest = makeGuest({ tags: ["vip"] });
    const directory = makeDirectoryResult({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
      updateGuest,
    });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(updateGuest).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ tags: expect.any(Array) })
      );
    });
  });
});

describe("GuestsPage - dietary restrictions editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
  });

  it("shows dietary restrictions checkboxes in edit mode", async () => {
    const guest = makeGuest({ dietaryRestrictions: ["vegetarian"] });
    renderPage({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
    });

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    expect(screen.getByLabelText(/vegetarian/i)).toBeDefined();
    expect(screen.getByLabelText(/vegan/i)).toBeDefined();
  });

  it("pre-checks dietary restrictions from guest data", async () => {
    const guest = makeGuest({ dietaryRestrictions: ["vegetarian"] });
    renderPage({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
    });

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    const checkbox = screen.getByLabelText(/vegetarian/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});

describe("GuestsPage - success toast on save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
  });

  it("shows success toast after successful save", async () => {
    const updateGuest = vi.fn().mockResolvedValue(undefined);
    const guest = makeGuest();
    const directory = makeDirectoryResult({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
      updateGuest,
    });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
    });
  });

  it("does not show success toast when save fails", async () => {
    const updateGuest = vi.fn().mockRejectedValue(new Error("Network error"));
    const guest = makeGuest();
    const directory = makeDirectoryResult({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
      updateGuest,
    });
    vi.mocked(useVenue).mockReturnValue(makeVenueContext());
    vi.mocked(useReservations).mockReturnValue(makeReservationsResult());

    render(<GuestsPage _useGuestDirectory={() => directory} />);

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });

    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });
});

describe("GuestsPage - form validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
  });

  it("disables Save when name is cleared", async () => {
    const user = userEvent.setup();
    const guest = makeGuest({ email: "john@example.com", phone: "+15551234" });
    renderPage({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
    });

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);

    expect(screen.getByText("Save")).toBeDisabled();
  });

  it("disables Save when invalid email is entered", async () => {
    const user = userEvent.setup();
    const guest = makeGuest({ email: "john@example.com", phone: "+15551234" });
    renderPage({
      guests: [guest],
      selectedGuestId: "g1",
      selectedGuest: guest,
    });

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    const emailInput = screen.getByLabelText("Email");
    await user.clear(emailInput);
    await user.type(emailInput, "not-an-email");

    expect(screen.getByText("Save")).toBeDisabled();
  });
});
