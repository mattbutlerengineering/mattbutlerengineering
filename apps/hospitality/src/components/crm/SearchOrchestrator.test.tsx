import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchOrchestrator } from "./SearchOrchestrator.js";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  EmptyState: ({ heading, description }: any) => (
    <div data-testid="empty-state">
      <span>{heading}</span>
      <span>{description}</span>
    </div>
  ),
  Input: (props: any) => (
    <input
      type={props.type}
      value={props.value ?? ""}
      onChange={props.onChange}
      placeholder={props.placeholder}
    />
  ),
  Text: ({ children }: any) => <span>{children}</span>,
}));

describe("SearchOrchestrator", () => {
  it("renders search input", () => {
    render(
      <SearchOrchestrator
        searchQuery=""
        onSearchChange={vi.fn()}
        onAddGuest={vi.fn()}
        guestCount={0}
        totalCount={0}
        isSearchActive={false}
        isEmpty={false}
      />
    );
    expect(screen.getByPlaceholderText("Search guests...")).toBeDefined();
  });

  it("renders Add Guest button", () => {
    render(
      <SearchOrchestrator
        searchQuery=""
        onSearchChange={vi.fn()}
        onAddGuest={vi.fn()}
        guestCount={0}
        totalCount={0}
        isSearchActive={false}
        isEmpty={false}
      />
    );
    expect(screen.getByText("Add Guest")).toBeDefined();
  });

  it("calls onSearchChange when typing", async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchOrchestrator
        searchQuery=""
        onSearchChange={onSearchChange}
        onAddGuest={vi.fn()}
        guestCount={5}
        totalCount={10}
        isSearchActive={false}
        isEmpty={false}
      />
    );
    await user.type(screen.getByPlaceholderText("Search guests..."), "J");
    expect(onSearchChange).toHaveBeenCalled();
  });

  it("calls onAddGuest when button clicked", async () => {
    const onAddGuest = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchOrchestrator
        searchQuery=""
        onSearchChange={vi.fn()}
        onAddGuest={onAddGuest}
        guestCount={0}
        totalCount={0}
        isSearchActive={false}
        isEmpty={false}
      />
    );
    await user.click(screen.getByText("Add Guest"));
    expect(onAddGuest).toHaveBeenCalled();
  });

  it("shows result count when guests present", () => {
    render(
      <SearchOrchestrator
        searchQuery=""
        onSearchChange={vi.fn()}
        onAddGuest={vi.fn()}
        guestCount={3}
        totalCount={10}
        isSearchActive={false}
        isEmpty={false}
      />
    );
    expect(screen.getByText("Showing 3 of 10 guests")).toBeDefined();
  });

  it("shows search empty state when isSearchActive and isEmpty", () => {
    render(
      <SearchOrchestrator
        searchQuery="zzz"
        onSearchChange={vi.fn()}
        onAddGuest={vi.fn()}
        guestCount={0}
        totalCount={0}
        isSearchActive={true}
        isEmpty={true}
      />
    );
    expect(screen.getByText("No guests found")).toBeDefined();
    expect(screen.getByText("Try adjusting your search query.")).toBeDefined();
  });

  it("shows default empty state when not searching and isEmpty", () => {
    render(
      <SearchOrchestrator
        searchQuery=""
        onSearchChange={vi.fn()}
        onAddGuest={vi.fn()}
        guestCount={0}
        totalCount={0}
        isSearchActive={false}
        isEmpty={true}
      />
    );
    expect(screen.getByText("No guests yet")).toBeDefined();
    expect(screen.getByText("Guests will appear here once they make a reservation.")).toBeDefined();
  });

  it("does not show empty state when guests present", () => {
    render(
      <SearchOrchestrator
        searchQuery=""
        onSearchChange={vi.fn()}
        onAddGuest={vi.fn()}
        guestCount={5}
        totalCount={10}
        isSearchActive={false}
        isEmpty={false}
      />
    );
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });

  it("does not show result count when isEmpty", () => {
    render(
      <SearchOrchestrator
        searchQuery=""
        onSearchChange={vi.fn()}
        onAddGuest={vi.fn()}
        guestCount={0}
        totalCount={0}
        isSearchActive={false}
        isEmpty={true}
      />
    );
    expect(screen.queryByText(/Showing/)).toBeNull();
  });
});
