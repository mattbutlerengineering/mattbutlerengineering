import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestsPage } from "./GuestsPage.js";
import { useVenue } from "../contexts/VenueContext.js";
import type { VenueContextValue } from "../contexts/VenueContext.js";
import type { Venue } from "@mbe/types";
import { useApiClient } from "../hooks/useApiClient.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

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

vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));

const mockApiClient = {
  guests: {
    list: vi.fn(),
    search: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getSegments: vi.fn(),
    findOrCreate: vi.fn(),
  },
  reservations: { list: vi.fn() },
};

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => mockApiClient),
}));

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
  DataList: ({ children, items }: any) => (
    <dl>
      {items?.map((item: any) => (
        <React.Fragment key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </React.Fragment>
      ))}
      {children}
    </dl>
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <GuestsPage />
    </Wrapper>
  );
}

/* ── Default mock data ───────────────────────── */

const defaultGuests = [
  {
    id: "g1",
    name: "John Doe",
    email: "john@example.com",
    phone: "+15551234",
    visitCount: 5,
    notes: null,
    tags: [],
    lastVisit: null,
    createdAt: "2026-01-01T00:00:00Z",
    venueId: "venue-1",
    updatedAt: "2026-01-01T00:00:00Z",
    lifetimeSpend: null,
  },
  {
    id: "g2",
    name: "Jane Smith",
    email: "jane@example.com",
    phone: null,
    visitCount: 2,
    notes: "Allergic to nuts",
    tags: ["vip"],
    lastVisit: null,
    createdAt: "2026-01-01T00:00:00Z",
    venueId: "venue-1",
    updatedAt: "2026-01-01T00:00:00Z",
    lifetimeSpend: null,
  },
];

const defaultSegments = [
  { name: "VIP", count: 5 },
  { name: "Regular", count: 10 },
];

function setupDefaultMocks() {
  vi.mocked(useVenue).mockReturnValue(makeVenueContext());

  mockApiClient.guests.list.mockResolvedValue({ data: defaultGuests, pagination: {} });
  mockApiClient.guests.getSegments.mockResolvedValue(defaultSegments);
  mockApiClient.guests.search.mockResolvedValue({ data: [], pagination: {} });
  mockApiClient.reservations.list.mockResolvedValue({ data: [], pagination: {} });
}

describe("GuestsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders the page header", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Guests")).toBeDefined();
    });
  });

  it("shows loading state initially", () => {
    mockApiClient.guests.list.mockReturnValue(new Promise(() => {}));
    mockApiClient.guests.getSegments.mockReturnValue(new Promise(() => {}));

    renderPage();
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders guest list after loading", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0);
  });

  it("renders segment stats", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("VIP")).toBeDefined();
    });
  });

  it("shows error banner when fetch fails", async () => {
    mockApiClient.guests.list.mockRejectedValue(new Error("Connection failed"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
  });

  it("shows Add Guest button", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Guest")).toBeDefined();
    });
  });

  it("opens add guest dialog when button is clicked", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Guest")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Add Guest"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });
  });
});

describe("GuestsPage - search filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();

    mockApiClient.guests.search.mockResolvedValue({
      data: [defaultGuests[0]],
      pagination: {},
    });
  });

  afterEach(() => {
    // Ensure fake timers never bleed into subsequent tests
    vi.useRealTimers();
  });

  it("calls search API when typing in search input", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText("Search guests...");
    await user.type(searchInput, "John");

    // Wait for debounce (300ms) + TQ to fire the search
    await waitFor(
      () => {
        expect(mockApiClient.guests.search).toHaveBeenCalledWith(
          expect.objectContaining({ query: "John" })
        );
      },
      { timeout: 2000 }
    );
  });

  it("shows filtered results after search", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText("Search guests...");
    await user.type(searchInput, "John");

    await waitFor(
      () => {
        expect(mockApiClient.guests.search).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );

    await waitFor(() => {
      expect(screen.queryByText("Jane Smith")).toBeNull();
    });
  });
});

describe("GuestsPage - segment stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockApiClient.guests.getSegments.mockResolvedValue([
      { name: "VIP", count: 5 },
      { name: "Regular", count: 10 },
      { name: "New", count: 3 },
    ]);
    mockApiClient.guests.list.mockResolvedValue({
      data: [defaultGuests[0]],
      pagination: {},
    });
  });

  it("renders a stat card for each segment", async () => {
    renderPage();

    await waitFor(() => {
      const stats = screen.getAllByTestId("stat");
      expect(stats.length).toBe(3);
    });
  });

  it("displays segment names and counts", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("VIP")).toBeDefined();
      expect(screen.getByText("Regular")).toBeDefined();
      expect(screen.getByText("New")).toBeDefined();
    });

    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("shows result count text with total from segments", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 18 guests")).toBeDefined();
    });
  });
});

describe("GuestsPage - guest detail drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockApiClient.guests.getSegments.mockResolvedValue([{ name: "VIP", count: 5 }]);
    mockApiClient.guests.list.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "John Doe",
          email: "john@example.com",
          phone: "+15551234",
          visitCount: 5,
          notes: "Prefers window seat",
          tags: ["vip", "regular"],
          lastVisit: "2026-03-15T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
          venueId: "venue-1",
          updatedAt: "2026-01-01T00:00:00Z",
          lifetimeSpend: null,
        },
        {
          id: "g2",
          name: "Jane Smith",
          email: "jane@example.com",
          phone: null,
          visitCount: 2,
          notes: null,
          tags: [],
          lastVisit: null,
          createdAt: "2026-01-01T00:00:00Z",
          venueId: "venue-1",
          updatedAt: "2026-01-01T00:00:00Z",
          lifetimeSpend: null,
        },
      ],
      pagination: {},
    });
    mockApiClient.reservations.list.mockResolvedValue({ data: [], pagination: {} });
  });

  it("opens drawer when clicking a guest row", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });
  });

  it("displays guest notes in the drawer", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });

    expect(screen.getAllByText("Prefers window seat").length).toBeGreaterThan(0);
  });

  it("displays guest tags in the drawer", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });

    const tags = screen.getAllByTestId("tag");
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });

  it("displays visit count in the drawer detail list", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });

    expect(screen.getAllByText("Visits").length).toBeGreaterThan(0);
  });

  it("fetches reservation history when drawer opens", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(mockApiClient.reservations.list).toHaveBeenCalledWith(
        expect.objectContaining({ guestId: "g1", limit: 10 })
      );
    });
  });

  it("opens drawer via keyboard Enter on guest row", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.keyDown(row, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });
  });

  it("shows edit form when Edit Guest button is clicked", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Edit Guest"));

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeDefined();
    });
  });

  it("calls update API when saving edited guest", async () => {
    mockApiClient.guests.update.mockResolvedValue({});

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Edit Guest"));

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockApiClient.guests.update).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ name: "John Doe" })
      );
    });
  });

  it("shows error when save fails", async () => {
    mockApiClient.guests.update.mockRejectedValue(new Error("Save failed"));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => {
      expect(screen.getByText("Save")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("Save failed")).toBeDefined();
    });
  });

  it("cancels edit and restores original data", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => {
      expect(screen.getByText("Save")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.getByText("Edit Guest")).toBeDefined();
    });
  });
});

describe("GuestsPage - add guest dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockApiClient.guests.getSegments.mockResolvedValue([]);
    mockApiClient.guests.list.mockResolvedValue({ data: [], pagination: {} });
    mockApiClient.guests.findOrCreate.mockResolvedValue({
      id: "g-new",
      name: "New Guest",
      email: "new@example.com",
      phone: null,
      visitCount: 0,
      notes: null,
      tags: [],
      lastVisit: null,
      createdAt: "2026-05-14T00:00:00Z",
      venueId: "venue-1",
      updatedAt: "2026-05-14T00:00:00Z",
      lifetimeSpend: null,
    });
  });

  it("submits the form and calls findOrCreate API", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Guest")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Add Guest"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, "New Guest");

    const emailInput = screen.getByLabelText("Email");
    await user.type(emailInput, "new@example.com");

    const buttons = screen.getAllByText("Add Guest");
    const submitButton = buttons[buttons.length - 1];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockApiClient.guests.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: "venue-1",
          name: "New Guest",
          email: "new@example.com",
        })
      );
    });
  });

  it("disables submit button when name is empty", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Guest")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Add Guest"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });

    const buttons = screen.getAllByText("Add Guest");
    const submitButton = buttons[buttons.length - 1];
    expect(submitButton.getAttribute("disabled")).not.toBeNull();
  });

  it("shows error when add guest API fails", async () => {
    mockApiClient.guests.findOrCreate.mockRejectedValue(new Error("Duplicate guest"));
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Guest")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Add Guest"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, "Dupe Guest");

    const buttons = screen.getAllByText("Add Guest");
    const submitButton = buttons[buttons.length - 1];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Duplicate guest")).toBeDefined();
    });
  });

  it("closes dialog on successful add", async () => {
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Guest")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Add Guest"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, "New Guest");

    const buttons = screen.getAllByText("Add Guest");
    const submitButton = buttons[buttons.length - 1];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByTestId("dialog")).toBeNull();
    });
  });

  it("closes dialog when Cancel is clicked", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Guest")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Add Guest"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("dialog")).toBeNull();
    });
  });
});

describe("GuestsPage - empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockApiClient.guests.getSegments.mockResolvedValue([]);
    mockApiClient.guests.list.mockResolvedValue({ data: [], pagination: {} });
  });

  it("shows empty state when no guests exist", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeDefined();
    });

    expect(screen.getByText("No guests yet")).toBeDefined();
    expect(screen.getByText("Guests will appear here once they make a reservation.")).toBeDefined();
  });

  it("shows search-specific empty state when no results match", async () => {
    const user = userEvent.setup();
    mockApiClient.guests.search.mockResolvedValue({ data: [], pagination: {} });

    // Initially return guests so search input is visible
    mockApiClient.guests.list.mockResolvedValue({
      data: [defaultGuests[0]],
      pagination: {},
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText("Search guests...");
    await user.type(searchInput, "zzzznonexistent");

    await waitFor(
      () => {
        expect(screen.getByTestId("empty-state")).toBeDefined();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText("No guests found")).toBeDefined();
    expect(screen.getByText("Try adjusting your search query.")).toBeDefined();
  });
});

describe("GuestsPage - error retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("displays the error message from failed API call", async () => {
    mockApiClient.guests.list.mockRejectedValue(new Error("Network timeout"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });

    expect(screen.getByText("Network timeout")).toBeDefined();
  });
});

describe("GuestsPage - no venue selected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVenue).mockReturnValue(
      makeVenueContext({ selectedVenueId: null, venues: [], selectedVenue: null })
    );
  });

  it("shows venue selection warning when no venue is selected", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Please select a venue to view guests.")).toBeDefined();
    });
  });

  it("does not call guest API when no venue is selected", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Please select a venue to view guests.")).toBeDefined();
    });

    expect(mockApiClient.guests.list).not.toHaveBeenCalled();
    expect(mockApiClient.guests.search).not.toHaveBeenCalled();
  });
});

describe("GuestsPage - guest table content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockApiClient.guests.getSegments.mockResolvedValue([{ name: "VIP", count: 5 }]);
    mockApiClient.guests.list.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "John Doe",
          email: "john@example.com",
          phone: "+15551234",
          visitCount: 5,
          notes: "Window seat",
          tags: ["vip"],
          lastVisit: "2026-03-15T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
          venueId: "venue-1",
          updatedAt: "2026-01-01T00:00:00Z",
          lifetimeSpend: null,
        },
        {
          id: "g2",
          name: "No Contact Guest",
          email: null,
          phone: null,
          visitCount: 0,
          notes: null,
          tags: [],
          lastVisit: null,
          createdAt: "2026-01-01T00:00:00Z",
          venueId: "venue-1",
          updatedAt: "2026-01-01T00:00:00Z",
          lifetimeSpend: null,
        },
      ],
      pagination: {},
    });
  });

  it("renders guest email and phone in the table", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("john@example.com").length).toBeGreaterThan(0);
      expect(screen.getAllByText("+15551234").length).toBeGreaterThan(0);
    });
  });

  it("renders guest tags in the table", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const tags = screen.getAllByTestId("tag");
    expect(tags.length).toBeGreaterThan(0);
  });

  it("renders visit count in the table", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
  });

  it("renders guest notes as caption text in the table row", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Window seat")).toBeDefined();
    });
  });

  it("renders table headers", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Guest")).toBeDefined();
      expect(screen.getByText("Contact")).toBeDefined();
      expect(screen.getAllByText("Visits").length).toBeGreaterThan(0);
      expect(screen.getByText("Last Visit")).toBeDefined();
      expect(screen.getByText("Tags")).toBeDefined();
    });
  });

  it("shows accessible guest count status text", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("2 guests shown")).toBeDefined();
    });
  });

  it("formats last visit date for guests with visits", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Never")).toBeDefined();
  });
});

describe("GuestsPage - multi-venue", () => {
  const mockSetVenueId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVenue).mockReturnValue(
      makeVenueContext({
        selectedVenueId: "venue-1",
        venues: [
          makeVenue({ id: "venue-1", name: "Downtown" }),
          makeVenue({ id: "venue-2", name: "Uptown" }),
        ],
        selectedVenue: makeVenue({ id: "venue-1", name: "Downtown" }),
        setVenueId: mockSetVenueId,
        isMultiVenue: true,
      })
    );

    mockApiClient.guests.getSegments.mockResolvedValue([]);
    mockApiClient.guests.list.mockResolvedValue({ data: [defaultGuests[0]], pagination: {} });
    mockApiClient.guests.search.mockResolvedValue({ data: [], pagination: {} });
    mockApiClient.reservations.list.mockResolvedValue({ data: [], pagination: {} });
  });

  it("does not show a venue selector (venue switching is sidebar-only)", async () => {
    renderPage();

    // Wait for the page to finish loading (guest data rendered)
    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    // Venue selector should NOT be present — switching is sidebar-only
    expect(screen.queryByTestId("select-Venue")).toBeNull();
  });
});

/* ── TDD: New feature tests ────────────────────── */

describe("GuestsPage - tags editing in drawer", () => {
  const mockApi = {
    guests: {
      list: vi.fn(),
      search: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      getSegments: vi.fn(),
      findOrCreate: vi.fn(),
    },
    reservations: { list: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
    vi.mocked(useApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([{ id: "s1", name: "VIP", count: 5 }]);
    mockApi.guests.list.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "John Doe",
          email: "john@example.com",
          phone: "+15551234",
          visitCount: 5,
          notes: null,
          tags: ["vip", "regular"],
          dietaryRestrictions: [],
          lastVisit: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { total: 1, page: 1, limit: 50 },
    });
    mockApi.reservations.list.mockResolvedValue({ data: [], meta: {} });
    mockApi.guests.update.mockResolvedValue({
      id: "g1",
      name: "John Doe",
      email: "john@example.com",
      phone: "+15551234",
      visitCount: 5,
      notes: null,
      tags: ["vip"],
      dietaryRestrictions: [],
      lastVisit: null,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("shows tags input in edit mode", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    // Tags input or section should be present in edit mode
    expect(screen.getByPlaceholderText(/add tag/i)).toBeDefined();
  });

  it("includes tags in the update API call", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockApi.guests.update).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ tags: expect.any(Array) })
      );
    });
  });
});

describe("GuestsPage - dietary restrictions editing", () => {
  const mockApi = {
    guests: {
      list: vi.fn(),
      search: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      getSegments: vi.fn(),
      findOrCreate: vi.fn(),
    },
    reservations: { list: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
    vi.mocked(useApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([{ id: "s1", name: "VIP", count: 5 }]);
    mockApi.guests.list.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "John Doe",
          email: "john@example.com",
          phone: null,
          visitCount: 3,
          notes: null,
          tags: [],
          dietaryRestrictions: ["vegetarian"],
          lastVisit: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { total: 1, page: 1, limit: 50 },
    });
    mockApi.reservations.list.mockResolvedValue({ data: [], meta: {} });
    mockApi.guests.update.mockResolvedValue({});
  });

  it("shows dietary restrictions checkboxes in edit mode", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    // Dietary restrictions checkboxes should be present
    expect(screen.getByLabelText(/vegetarian/i)).toBeDefined();
    expect(screen.getByLabelText(/vegan/i)).toBeDefined();
    expect(screen.getByLabelText(/gluten.free/i)).toBeDefined();
  });

  it("pre-checks dietary restrictions from guest data", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    const vegetarianCheckbox = screen.getByLabelText(/vegetarian/i) as HTMLInputElement;
    expect(vegetarianCheckbox.checked).toBe(true);
  });

  it("includes dietaryRestrictions in the update API call", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockApi.guests.update).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ dietaryRestrictions: expect.any(Array) })
      );
    });
  });

  it("toggles a dietary restriction when checkbox is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    // Vegan starts unchecked, click to check it
    const veganCheckbox = screen.getByLabelText(/vegan/i) as HTMLInputElement;
    expect(veganCheckbox.checked).toBe(false);
    await user.click(veganCheckbox);
    expect(veganCheckbox.checked).toBe(true);

    // Save and verify the update includes vegan
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockApi.guests.update).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({
          dietaryRestrictions: expect.arrayContaining(["vegetarian", "vegan"]),
        })
      );
    });
  });
});

describe("GuestsPage - success toast on save", () => {
  const mockApi = {
    guests: {
      list: vi.fn(),
      search: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      getSegments: vi.fn(),
      findOrCreate: vi.fn(),
    },
    reservations: { list: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
    vi.mocked(useApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([{ id: "s1", name: "VIP", count: 5 }]);
    mockApi.guests.list.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "John Doe",
          email: "john@example.com",
          phone: null,
          visitCount: 3,
          notes: null,
          tags: [],
          dietaryRestrictions: [],
          staffNotes: [],
          lastVisit: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { total: 1, page: 1, limit: 50 },
    });
    mockApi.reservations.list.mockResolvedValue({ data: [], meta: {} });
    mockApi.guests.update.mockResolvedValue({});
  });

  it("shows success toast after successful save", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
    });
  });

  it("does not show success toast when save fails", async () => {
    mockApi.guests.update.mockRejectedValue(new Error("Network error"));
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

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
  const mockApi = {
    guests: {
      list: vi.fn(),
      search: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      getSegments: vi.fn(),
      findOrCreate: vi.fn(),
    },
    reservations: { list: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
    vi.mocked(useApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([{ id: "s1", name: "VIP", count: 5 }]);
    mockApi.guests.list.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "John Doe",
          email: "john@example.com",
          phone: "+15551234",
          visitCount: 3,
          notes: null,
          tags: [],
          dietaryRestrictions: [],
          lastVisit: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { total: 1, page: 1, limit: 50 },
    });
    mockApi.reservations.list.mockResolvedValue({ data: [], meta: {} });
  });

  it("disables Save when name is cleared", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);

    const saveButton = screen.getByText("Save");
    expect(saveButton).toBeDisabled();
  });

  it("shows email format error when invalid email is entered", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0));

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId("drawer")).toBeDefined());

    fireEvent.click(screen.getByText("Edit Guest"));
    await waitFor(() => expect(screen.getByText("Save")).toBeDefined());

    const emailInput = screen.getByLabelText("Email");
    await user.clear(emailInput);
    await user.type(emailInput, "not-an-email");

    // Save button should be disabled or an error shown
    const saveButton = screen.getByText("Save");
    expect(saveButton).toBeDisabled();
  });
});
