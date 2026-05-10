/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReservationsPage } from "./ReservationsPage.js";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservationData } from "../contexts/ReservationDataContext.js";
import React from "react";

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));
vi.mock("@mbe/api-client", () => ({ createApiClient: vi.fn() }));
vi.mock("../contexts/VenueContext.js", () => ({ useVenue: vi.fn() }));
vi.mock("../contexts/ReservationDataContext.js", () => ({ useReservationData: vi.fn() }));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: any) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  EmptyState: ({ heading }: any) => <div data-testid="empty-state">{heading}</div>,
  Input: (props: any) => (
    <input data-testid="search-input" placeholder={props.placeholder} value={props.value} onChange={props.onChange} />
  ),
  SegmentedControl: ({ segments, value: _value, onChange }: any) => (
    <div data-testid="segmented-control">
      {segments?.map((s: any) => (
        <button key={s.id} data-testid={`segment-${s.id}`} onClick={() => onChange?.(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Stat: ({ label, value }: any) => <div data-testid="stat"><span>{label}</span><span>{value}</span></div>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

describe("ReservationsPage", () => {
  const mockApi = {
    reservations: { list: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({ accessToken: "token" } as any);
    vi.mocked(createApiClient).mockReturnValue(mockApi as any);
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [],
      selectVenue: vi.fn(),
    } as any);
    vi.mocked(useReservationData).mockReturnValue({
      reservations: [
        { id: "r1", guestName: "Alice", date: "2026-05-10", startTime: "18:00", endTime: "20:00", partySize: 2, status: "CONFIRMED" },
        { id: "r2", guestName: "Bob", date: "2026-05-10", startTime: "19:00", endTime: "21:00", partySize: 4, status: "PENDING" },
        { id: "r3", guestName: "Carol", date: "2026-05-10", startTime: "20:00", endTime: "22:00", partySize: 6, status: "CANCELLED" },
      ],
      tables: [],
      isConnected: true,
      sseError: null,
      addReservation: vi.fn(),
      updateReservation: vi.fn(),
      removeReservation: vi.fn(),
      setReservations: vi.fn(),
      setTables: vi.fn(),
      subscribeToEvents: vi.fn(() => vi.fn()),
    } as any);

    mockApi.reservations.list.mockResolvedValue({
      data: [
        { id: "r1", guestName: "Alice", date: "2026-05-10", startTime: "18:00", endTime: "20:00", partySize: 2, status: "CONFIRMED" },
      ],
    });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ReservationsPage />
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

  it("displays guest names in the reservation list", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });
  });
});
