/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
    <div data-testid="page-header"><h1>{title}</h1><p>{description}</p></div>
  ),
}));

vi.mock("../components/ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({ error }: any) => <div data-testid="error-banner">{error}</div>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  Card: ({ children, title }: any) => <div data-testid="card">{title}{children}</div>,
  DataList: ({ children }: any) => <dl>{children}</dl>,
  Dialog: ({ children, open, title, footer }: any) =>
    open ? <div data-testid="dialog"><h2>{title}</h2>{children}{footer}</div> : null,
  Divider: () => <hr />,
  Drawer: ({ children, open }: any) => open ? <div data-testid="drawer">{children}</div> : null,
  EmptyState: ({ heading, description }: any) => (
    <div data-testid="empty-state"><span>{heading}</span><span>{description}</span></div>
  ),
  Input: (props: any) => {
    const id = props.label?.replace(/\s+/g, "-").toLowerCase() || "input";
    return (
      <div>
        <label htmlFor={id}>{props.label}</label>
        <input id={id} value={props.value ?? ""} onChange={props.onChange} placeholder={props.placeholder} />
      </div>
    );
  },
  Select: (props: any) => (
    <select data-testid={`select-${props.label}`} value={props.value} onChange={(e) => props.onChange?.(e.target.value)}>
      {props.options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Stat: ({ label, value }: any) => <div data-testid="stat"><span>{label}</span><span>{value}</span></div>,
  Tag: ({ children }: any) => <span data-testid="tag">{children}</span>,
  Text: ({ children }: any) => <span>{children}</span>,
  TextArea: (props: any) => <textarea data-testid="textarea" value={props.value} onChange={(e) => props.onChange?.(e)} />,
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
        { id: "g1", name: "John Doe", email: "john@example.com", phone: "+15551234", visitCount: 5, notes: null, tags: [], lastVisit: null, createdAt: "2026-01-01T00:00:00Z" },
        { id: "g2", name: "Jane Smith", email: "jane@example.com", phone: null, visitCount: 2, notes: "Allergic to nuts", tags: ["vip"], lastVisit: null, createdAt: "2026-01-01T00:00:00Z" },
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
