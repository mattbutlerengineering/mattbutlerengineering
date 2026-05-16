import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservationList } from "./ReservationList.js";
import type { Reservation } from "@mbe/types";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="card" data-title={title}>{children}</div>
  ),
  Text: ({ children, variant, color }: { children?: React.ReactNode; variant?: string; color?: string }) => (
    <span data-testid="text" data-variant={variant} data-color={color}>{children}</span>
  ),
  Badge: ({ children, variant, size }: { children?: React.ReactNode; variant?: string; size?: string }) => (
    <span data-testid="badge" data-variant={variant} data-size={size}>{children}</span>
  ),
  Skeleton: ({ variant, height, width }: { variant?: string; height?: string; width?: string }) => (
    <div data-testid="skeleton" data-variant={variant} data-height={height} data-width={width} />
  ),
}));

const mockReservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: "res-1",
  venueId: "venue-1",
  guestName: "John Doe",
  startTime: "18:00",
  partySize: 4,
  status: "CONFIRMED",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  ...overrides,
});

describe("ReservationList", () => {
  it("should show skeleton when loading", () => {
    const { container } = render(
      <ReservationList reservations={[]} isLoading={true} />
    );
    expect(container.querySelector('[data-testid="skeleton"]')).toBeDefined();
  });

  it("should show 'No reservations today' when empty", () => {
    render(<ReservationList reservations={[]} isLoading={false} />);
    expect(screen.getByText("No reservations today")).toBeDefined();
  });

  it("should render reservations sorted by time", () => {
    const reservations = [
      mockReservation({ id: "res-1", startTime: "19:00", status: "CONFIRMED" }),
      mockReservation({ id: "res-2", startTime: "17:00", status: "CONFIRMED" }),
      mockReservation({ id: "res-3", startTime: "18:30", status: "CONFIRMED" }),
    ];
    render(<ReservationList reservations={reservations} isLoading={false} />);
    
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBe(3);
    // Check first item is 5:00pm (17:00)
    expect(items[0].textContent).toContain("5:00pm");
    // Check last item is 7:00pm (19:00)
    expect(items[2].textContent).toContain("7:00pm");
  });

  it("should display guest name or 'Walk-in'", () => {
    const reservations = [
      mockReservation({ guestName: "Jane Smith" }),
      mockReservation({ guestName: null }),
    ];
    render(<ReservationList reservations={reservations} isLoading={false} />);
    
    expect(screen.getByText("Jane Smith")).toBeDefined();
    expect(screen.getByText("Walk-in")).toBeDefined();
  });

  it("should display party size", () => {
    const reservations = [
      mockReservation({ partySize: 2 }),
      mockReservation({ partySize: 6 }),
    ];
    render(<ReservationList reservations={reservations} isLoading={false} />);
    
    expect(screen.getByText("Party of 2")).toBeDefined();
    expect(screen.getByText("Party of 6")).toBeDefined();
  });

  it("should display status badge", () => {
    const reservations = [
      mockReservation({ status: "PENDING" }),
      mockReservation({ status: "CONFIRMED" }),
      mockReservation({ status: "CANCELLED" }),
    ];
    render(<ReservationList reservations={reservations} isLoading={false} />);
    
    expect(screen.getByText("PENDING")).toBeDefined();
    expect(screen.getByText("CONFIRMED")).toBeDefined();
  });

  it("should filter out CANCELLED reservations", () => {
    const reservations = [
      mockReservation({ id: "1", status: "CONFIRMED" }),
      mockReservation({ id: "2", status: "CANCELLED" }),
    ];
    render(<ReservationList reservations={reservations} isLoading={false} />);
    
    expect(screen.queryByText("CANCELLED")).toBeNull();
  });

  it("should filter out NO_SHOW reservations", () => {
    const reservations = [
      mockReservation({ id: "1", status: "CONFIRMED" }),
      mockReservation({ id: "2", status: "NO_SHOW" }),
    ];
    render(<ReservationList reservations={reservations} isLoading={false} />);
    
    expect(screen.queryByText("NO_SHOW")).toBeNull();
  });

  it("should include PENDING and COMPLETED reservations", () => {
    const reservations = [
      mockReservation({ status: "PENDING" }),
      mockReservation({ status: "COMPLETED" }),
    ];
    render(<ReservationList reservations={reservations} isLoading={false} />);
    
    expect(screen.getByText("PENDING")).toBeDefined();
    expect(screen.getByText("COMPLETED")).toBeDefined();
  });
});