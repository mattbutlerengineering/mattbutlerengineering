import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GuestTable } from "./GuestTable.js";
import type { Guest } from "@mbe/types";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Button: ({ children, onClick, className }: any) => (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  ),
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  Tag: ({ children }: any) => <span data-testid="tag">{children}</span>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

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

describe("GuestTable", () => {
  it("renders table headers", () => {
    render(<GuestTable guests={[makeGuest()]} selectedGuestId={null} onRowClick={vi.fn()} />);
    expect(screen.getByText("Guest")).toBeDefined();
    expect(screen.getByText("Contact")).toBeDefined();
    expect(screen.getAllByText("Visits").length).toBeGreaterThan(0);
    expect(screen.getByText("Last Visit")).toBeDefined();
    expect(screen.getByText("Tags")).toBeDefined();
  });

  it("renders guest name in each row", () => {
    render(
      <GuestTable
        guests={[makeGuest(), makeGuest({ id: "g2", name: "Jane Smith" })]}
        selectedGuestId={null}
        onRowClick={vi.fn()}
      />
    );
    expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jane Smith").length).toBeGreaterThan(0);
  });

  it("renders guest email and phone", () => {
    render(
      <GuestTable
        guests={[makeGuest({ email: "john@example.com", phone: "+15551234" })]}
        selectedGuestId={null}
        onRowClick={vi.fn()}
      />
    );
    expect(screen.getAllByText("john@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+15551234").length).toBeGreaterThan(0);
  });

  it("renders guest visit count", () => {
    render(
      <GuestTable
        guests={[makeGuest({ visitCount: 7 })]}
        selectedGuestId={null}
        onRowClick={vi.fn()}
      />
    );
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
  });

  it("renders guest tags", () => {
    render(
      <GuestTable
        guests={[makeGuest({ tags: ["vip"] })]}
        selectedGuestId={null}
        onRowClick={vi.fn()}
      />
    );
    expect(screen.getAllByTestId("tag").length).toBeGreaterThan(0);
  });

  it("renders guest notes", () => {
    render(
      <GuestTable
        guests={[makeGuest({ notes: "Window seat" })]}
        selectedGuestId={null}
        onRowClick={vi.fn()}
      />
    );
    expect(screen.getByText("Window seat")).toBeDefined();
  });

  it("calls onRowClick when clicking a row", () => {
    const onRowClick = vi.fn();
    render(<GuestTable guests={[makeGuest()]} selectedGuestId={null} onRowClick={onRowClick} />);
    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledWith("g1");
  });

  it("calls onRowClick on keyboard Enter", () => {
    const onRowClick = vi.fn();
    render(<GuestTable guests={[makeGuest()]} selectedGuestId={null} onRowClick={onRowClick} />);
    const row = screen.getByRole("button", { name: "View details for John Doe" });
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith("g1");
  });

  it("renders mobile cards for each guest", () => {
    render(
      <GuestTable
        guests={[makeGuest(), makeGuest({ id: "g2", name: "Jane Smith" })]}
        selectedGuestId={null}
        onRowClick={vi.fn()}
      />
    );
    // Mobile cards show the same names
    const names = screen.getAllByText("John Doe");
    expect(names.length).toBeGreaterThan(0);
  });
});
