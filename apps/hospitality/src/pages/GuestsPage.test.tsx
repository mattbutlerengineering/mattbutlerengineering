/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestsPage } from "./GuestsPage.js";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { useVenue } from "../contexts/VenueContext.js";
import React from "react";

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));
vi.mock("@mbe/api-client", () => ({ createApiClient: vi.fn() }));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));

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

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children, title }: any) => (
    <div data-testid="card">
      {title}
      {children}
    </div>
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
        <label htmlFor={id}>{props.label}</label>
        <input
          id={id}
          value={props.value ?? ""}
          onChange={props.onChange}
          placeholder={props.placeholder}
        />
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
}));

describe("GuestsPage", () => {
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

    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([
      { id: "s1", name: "VIP", count: 5 },
      { id: "s2", name: "Regular", count: 10 },
    ]);

    mockApi.guests.list.mockResolvedValue({
      data: [
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
        },
      ],
      meta: { total: 2, page: 1, limit: 50 },
    });
  });

  it("renders the page header", async () => {
    render(<GuestsPage />);
    await waitFor(() => {
      expect(screen.getByText("Guests")).toBeDefined();
    });
  });

  it("shows loading state initially", () => {
    // Make the API never resolve to test loading state
    mockApi.guests.list.mockReturnValue(new Promise(() => {}));
    mockApi.guests.getSegments.mockReturnValue(new Promise(() => {}));

    render(<GuestsPage />);
    // Should show loading skeleton
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders guest list after loading", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0);
  });

  it("renders segment stats", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByText("VIP")).toBeDefined();
    });
  });

  it("shows error banner when fetch fails", async () => {
    mockApi.guests.list.mockRejectedValue(new Error("Connection failed"));
    mockApi.guests.getSegments.mockRejectedValue(new Error("Connection failed"));

    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });
  });

  it("shows Add Guest button", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByText("Add Guest")).toBeDefined();
    });
  });

  it("opens add guest dialog when button is clicked", async () => {
    render(<GuestsPage />);

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
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([
      { id: "s1", name: "VIP", count: 5 },
      { id: "s2", name: "Regular", count: 10 },
    ]);

    mockApi.guests.list.mockResolvedValue({
      data: [
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
        },
      ],
      meta: { total: 2, page: 1, limit: 50 },
    });

    mockApi.guests.search.mockResolvedValue({
      data: [
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
        },
      ],
      meta: { total: 1, page: 1, limit: 50 },
    });
  });

  it("calls search API when typing in search input", async () => {
    const user = userEvent.setup();
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText("Search guests...");
    await user.type(searchInput, "John");

    await waitFor(() => {
      expect(mockApi.guests.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: "John" })
      );
    });
  });

  it("shows filtered results after search", async () => {
    const user = userEvent.setup();
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText("Search guests...");
    await user.type(searchInput, "John");

    await waitFor(() => {
      expect(mockApi.guests.search).toHaveBeenCalled();
    });

    // After search resolves, only John should remain
    await waitFor(() => {
      expect(screen.queryByText("Jane Smith")).toBeNull();
    });
  });
});

describe("GuestsPage - segment stats", () => {
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
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([
      { id: "s1", name: "VIP", count: 5 },
      { id: "s2", name: "Regular", count: 10 },
      { id: "s3", name: "New", count: 3 },
    ]);

    mockApi.guests.list.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "John Doe",
          email: "john@example.com",
          phone: null,
          visitCount: 5,
          notes: null,
          tags: [],
          lastVisit: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { total: 1, page: 1, limit: 50 },
    });
  });

  it("renders a stat card for each segment", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      const stats = screen.getAllByTestId("stat");
      expect(stats.length).toBe(3);
    });
  });

  it("displays segment names and counts", async () => {
    render(<GuestsPage />);

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
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 18 guests")).toBeDefined();
    });
  });
});

describe("GuestsPage - guest detail drawer", () => {
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
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
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
          notes: "Prefers window seat",
          tags: ["vip", "regular"],
          lastVisit: "2026-03-15T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
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
        },
      ],
      meta: { total: 2, page: 1, limit: 50 },
    });

    mockApi.reservations.list.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10 },
    });
  });

  it("opens drawer when clicking a guest row", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    // Click the table row (it has role="button" and aria-label)
    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });
  });

  it("displays guest notes in the drawer", async () => {
    render(<GuestsPage />);

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
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId("drawer")).toBeDefined();
    });

    const tags = screen.getAllByTestId("tag");
    // The table row also shows tags, but the drawer should have its own set
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });

  it("displays visit count in the drawer detail list", async () => {
    render(<GuestsPage />);

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
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);

    await waitFor(() => {
      expect(mockApi.reservations.list).toHaveBeenCalledWith(
        expect.objectContaining({ guestId: "g1", limit: 10 })
      );
    });
  });

  it("opens drawer via keyboard Enter on guest row", async () => {
    render(<GuestsPage />);

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
    render(<GuestsPage />);

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
      // Edit mode shows Save button
      expect(screen.getByText("Save")).toBeDefined();
    });
  });

  it("calls update API when saving edited guest", async () => {
    mockApi.guests.update.mockResolvedValue({});

    render(<GuestsPage />);

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
      expect(mockApi.guests.update).toHaveBeenCalledWith(
        "g1",
        expect.objectContaining({ name: "John Doe" })
      );
    });
  });

  it("shows error when save fails", async () => {
    mockApi.guests.update.mockRejectedValue(new Error("Save failed"));

    render(<GuestsPage />);

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
    render(<GuestsPage />);

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

    // Click Cancel
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      // Should go back to view mode with Edit Guest button
      expect(screen.getByText("Edit Guest")).toBeDefined();
    });
  });
});

describe("GuestsPage - add guest dialog", () => {
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
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([]);
    mockApi.guests.list.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 50 },
    });
    mockApi.guests.findOrCreate.mockResolvedValue({
      id: "g-new",
      name: "New Guest",
      email: "new@example.com",
      phone: null,
      visitCount: 0,
      notes: null,
      tags: [],
      lastVisit: null,
      createdAt: "2026-05-14T00:00:00Z",
    });
  });

  it("submits the form and calls findOrCreate API", async () => {
    const user = userEvent.setup();
    render(<GuestsPage />);

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

    // The second "Add Guest" button is the submit button inside the dialog
    const buttons = screen.getAllByText("Add Guest");
    const submitButton = buttons[buttons.length - 1];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockApi.guests.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: "venue-1",
          name: "New Guest",
          email: "new@example.com",
        })
      );
    });
  });

  it("disables submit button when name is empty", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByText("Add Guest")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Add Guest"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog")).toBeDefined();
    });

    // The submit button inside the dialog should be disabled (name is empty)
    const buttons = screen.getAllByText("Add Guest");
    const submitButton = buttons[buttons.length - 1];
    expect(submitButton.getAttribute("disabled")).not.toBeNull();
  });

  it("shows error when add guest API fails", async () => {
    mockApi.guests.findOrCreate.mockRejectedValue(new Error("Duplicate guest"));
    const user = userEvent.setup();

    render(<GuestsPage />);

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

  it("closes dialog and refreshes guests on successful add", async () => {
    const user = userEvent.setup();

    // After add, re-fetch returns the new guest
    mockApi.guests.list
      .mockResolvedValueOnce({
        data: [],
        meta: { total: 0, page: 1, limit: 50 },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "g-new",
            name: "New Guest",
            email: "new@example.com",
            phone: null,
            visitCount: 0,
            notes: null,
            tags: [],
            lastVisit: null,
            createdAt: "2026-05-14T00:00:00Z",
          },
        ],
        meta: { total: 1, page: 1, limit: 50 },
      });

    render(<GuestsPage />);

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
      // Dialog should close after successful submission
      expect(screen.queryByTestId("dialog")).toBeNull();
    });

    // fetchGuests should have been called again
    await waitFor(() => {
      expect(mockApi.guests.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("closes dialog when Cancel is clicked", async () => {
    render(<GuestsPage />);

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
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([]);
    mockApi.guests.list.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 50 },
    });
  });

  it("shows empty state when no guests exist", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeDefined();
    });

    expect(screen.getByText("No guests yet")).toBeDefined();
    expect(screen.getByText("Guests will appear here once they make a reservation.")).toBeDefined();
  });

  it("shows search-specific empty state when no results match", async () => {
    const user = userEvent.setup();
    mockApi.guests.search.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 50 },
    });

    // Initially return guests so search input is visible
    mockApi.guests.list.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "John Doe",
          email: "john@example.com",
          phone: null,
          visitCount: 1,
          notes: null,
          tags: [],
          lastVisit: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { total: 1, page: 1, limit: 50 },
    });

    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText("Search guests...");
    await user.type(searchInput, "zzzznonexistent");

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeDefined();
    });

    expect(screen.getByText("No guests found")).toBeDefined();
    expect(screen.getByText("Try adjusting your search query.")).toBeDefined();
  });
});

describe("GuestsPage - error retry", () => {
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
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [{ id: "venue-1", name: "Test Venue" }],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);
  });

  it("displays the error message from failed API call", async () => {
    mockApi.guests.list.mockRejectedValue(new Error("Network timeout"));
    mockApi.guests.getSegments.mockRejectedValue(new Error("Network timeout"));

    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });

    expect(screen.getByText("Network timeout")).toBeDefined();
  });

  it("shows generic error message for non-Error throws", async () => {
    mockApi.guests.list.mockRejectedValue("unknown error");
    mockApi.guests.getSegments.mockRejectedValue("unknown error");

    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });

    expect(screen.getByText("Failed to load guests")).toBeDefined();
  });
});

describe("GuestsPage - no venue selected", () => {
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
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: null,
      venues: [],
      selectVenue: vi.fn(),
      setVenueId: vi.fn(),
      isMultiVenue: false,
    } as any);
  });

  it("shows venue selection warning when no venue is selected", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByText("Please select a venue to view guests.")).toBeDefined();
    });
  });

  it("does not call guest API when no venue is selected", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByText("Please select a venue to view guests.")).toBeDefined();
    });

    expect(mockApi.guests.list).not.toHaveBeenCalled();
    expect(mockApi.guests.search).not.toHaveBeenCalled();
  });
});

describe("GuestsPage - guest table content", () => {
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
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
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
          notes: "Window seat",
          tags: ["vip"],
          lastVisit: "2026-03-15T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
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
        },
      ],
      meta: { total: 2, page: 1, limit: 50 },
    });
  });

  it("renders guest email and phone in the table", async () => {
    render(<GuestsPage />);

    // Email and phone appear in both desktop table and mobile cards
    await waitFor(() => {
      expect(screen.getAllByText("john@example.com").length).toBeGreaterThan(0);
      expect(screen.getAllByText("+15551234").length).toBeGreaterThan(0);
    });
  });

  it("renders guest tags in the table", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    const tags = screen.getAllByTestId("tag");
    expect(tags.length).toBeGreaterThan(0);
  });

  it("renders visit count in the table", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    // Visit count appears in stat, table cell, and mobile badge
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
  });

  it("renders guest notes as caption text in the table row", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByText("Window seat")).toBeDefined();
    });
  });

  it("renders table headers", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByText("Guest")).toBeDefined();
      expect(screen.getByText("Contact")).toBeDefined();
      expect(screen.getAllByText("Visits").length).toBeGreaterThan(0);
      expect(screen.getByText("Last Visit")).toBeDefined();
      expect(screen.getByText("Tags")).toBeDefined();
    });
  });

  it("shows accessible guest count status text", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByText("2 guests shown")).toBeDefined();
    });
  });

  it("formats last visit date for guests with visits", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    // "Never" should appear for the guest with no lastVisit
    expect(screen.getByText("Never")).toBeDefined();
  });
});

describe("GuestsPage - multi-venue", () => {
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

  const mockSetVenueId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [
        { id: "venue-1", name: "Downtown" },
        { id: "venue-2", name: "Uptown" },
      ],
      selectVenue: vi.fn(),
      setVenueId: mockSetVenueId,
      isMultiVenue: true,
    } as any);

    mockApi.guests.getSegments.mockResolvedValue([]);
    mockApi.guests.list.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "John Doe",
          email: null,
          phone: null,
          visitCount: 1,
          notes: null,
          tags: [],
          lastVisit: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      meta: { total: 1, page: 1, limit: 50 },
    });
  });

  it("shows venue selector when isMultiVenue is true", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("select-Venue")).toBeDefined();
    });
  });

  it("calls setVenueId when venue is changed", async () => {
    render(<GuestsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("select-Venue")).toBeDefined();
    });

    fireEvent.change(screen.getByTestId("select-Venue"), {
      target: { value: "venue-2" },
    });

    expect(mockSetVenueId).toHaveBeenCalledWith("venue-2");
  });
});
