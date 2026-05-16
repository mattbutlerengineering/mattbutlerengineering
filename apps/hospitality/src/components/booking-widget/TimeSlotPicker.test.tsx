/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeSlotPicker } from "./TimeSlotPicker.js";
import type { TimeSlot } from "@mbe/types";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, onClick, size, variant }: any) => (
    <button onClick={onClick} data-size={size} data-variant={variant}>
      {children}
    </button>
  ),
  Alert: ({ children, variant, actions }: any) => (
    <div data-testid="alert" data-variant={variant}>
      {children}
      {actions}
    </div>
  ),
  Skeleton: ({ variant, width, height }: any) => (
    <div data-testid="skeleton" data-variant={variant} style={{ width, height }} />
  ),
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  EmptyState: ({ heading, description }: any) => (
    <div data-testid="empty-state">
      <span>{heading}</span>
      <span>{description}</span>
    </div>
  ),
}));

function makeSlot(time: string, available = true): TimeSlot {
  return { time, available };
}

describe("TimeSlotPicker", () => {
  const defaultProps = {
    slots: [] as TimeSlot[],
    selectedSlot: null,
    isLoading: false,
    error: null,
    onSelectSlot: vi.fn(),
    onBack: vi.fn(),
    date: "2026-05-20",
    partySize: 2,
  };

  it("renders loading skeleton when isLoading is true", () => {
    render(<TimeSlotPicker {...defaultProps} isLoading={true} />);
    expect(screen.getByTestId("skeleton-group")).toBeDefined();
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBe(8); // SKELETON_SLOT_COUNT
  });

  it("renders error alert when error is present", () => {
    render(<TimeSlotPicker {...defaultProps} error="Something went wrong" />);
    expect(screen.getByTestId("alert")).toBeDefined();
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("renders back button in error state", () => {
    const onBack = vi.fn();
    render(<TimeSlotPicker {...defaultProps} error="Error" onBack={onBack} />);
    const backBtn = screen.getByText(/Change date or party size/);
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });

  it("renders empty state when no slots are available", () => {
    render(<TimeSlotPicker {...defaultProps} slots={[]} />);
    expect(screen.getByTestId("empty-state")).toBeDefined();
    expect(screen.getByText("No available times")).toBeDefined();
    expect(screen.getByText("Try a different date or party size.")).toBeDefined();
  });

  it("renders slots grouped by lunch period", () => {
    const slots = [makeSlot("2026-05-20T12:00:00"), makeSlot("2026-05-20T12:30:00")];
    render(<TimeSlotPicker {...defaultProps} slots={slots} />);
    expect(screen.getByText("Lunch")).toBeDefined();
  });

  it("renders slots grouped by dinner period", () => {
    const slots = [makeSlot("2026-05-20T18:00:00"), makeSlot("2026-05-20T19:00:00")];
    render(<TimeSlotPicker {...defaultProps} slots={slots} />);
    expect(screen.getByText("Dinner")).toBeDefined();
  });

  it("renders slots grouped by late night period", () => {
    const slots = [makeSlot("2026-05-20T21:00:00"), makeSlot("2026-05-20T22:00:00")];
    render(<TimeSlotPicker {...defaultProps} slots={slots} />);
    expect(screen.getByText("Late Night")).toBeDefined();
  });

  it("calls onSelectSlot when a time slot is clicked", () => {
    const onSelectSlot = vi.fn();
    const slots = [makeSlot("2026-05-20T18:00:00")];
    render(<TimeSlotPicker {...defaultProps} slots={slots} onSelectSlot={onSelectSlot} />);

    const slotBtn = screen.getByRole("option");
    fireEvent.click(slotBtn);
    expect(onSelectSlot).toHaveBeenCalledWith(slots[0]);
  });

  it("marks selected slot with aria-selected", () => {
    const slot = makeSlot("2026-05-20T18:00:00");
    render(<TimeSlotPicker {...defaultProps} slots={[slot]} selectedSlot={slot} />);

    const slotBtn = screen.getByRole("option");
    expect(slotBtn.getAttribute("aria-selected")).toBe("true");
  });

  it("shows selected summary when a slot is selected", () => {
    const slot = makeSlot("2026-05-20T18:00:00");
    render(<TimeSlotPicker {...defaultProps} slots={[slot]} selectedSlot={slot} />);
    expect(screen.getByText("Selected:")).toBeDefined();
  });

  it("shows table count in selected summary when tables are available", () => {
    const slot: TimeSlot = {
      time: "2026-05-20T18:00:00",
      available: true,
      tables: [{ id: "t1" }, { id: "t2" }] as any,
    };
    render(<TimeSlotPicker {...defaultProps} slots={[slot]} selectedSlot={slot} />);
    expect(screen.getByText(/2 tables available/)).toBeDefined();
  });

  it("shows singular 'table' when only one table available", () => {
    const slot: TimeSlot = {
      time: "2026-05-20T18:00:00",
      available: true,
      tables: [{ id: "t1" }] as any,
    };
    render(<TimeSlotPicker {...defaultProps} slots={[slot]} selectedSlot={slot} />);
    expect(screen.getByText(/1 table available/)).toBeDefined();
  });

  it("renders the formatted date in the top bar", () => {
    const slots = [makeSlot("2026-05-20T18:00:00")];
    render(<TimeSlotPicker {...defaultProps} slots={slots} date="2026-05-20" />);
    // Should contain "Wednesday, May 20" (locale-dependent)
    expect(screen.getByText(/May/)).toBeDefined();
  });

  it("renders party size with correct pluralization", () => {
    const slots = [makeSlot("2026-05-20T18:00:00")];
    render(<TimeSlotPicker {...defaultProps} slots={slots} partySize={1} />);
    expect(screen.getByText("1 guest")).toBeDefined();
  });

  it("renders party size with plural form", () => {
    const slots = [makeSlot("2026-05-20T18:00:00")];
    render(<TimeSlotPicker {...defaultProps} slots={slots} partySize={4} />);
    expect(screen.getByText("4 guests")).toBeDefined();
  });

  it("calls onBack when Back button is clicked", () => {
    const onBack = vi.fn();
    const slots = [makeSlot("2026-05-20T18:00:00")];
    render(<TimeSlotPicker {...defaultProps} slots={slots} onBack={onBack} />);
    fireEvent.click(screen.getByText(/Back/));
    expect(onBack).toHaveBeenCalled();
  });

  it("does not render a period section if no slots fall in that period", () => {
    const slots = [makeSlot("2026-05-20T18:00:00")]; // dinner only
    render(<TimeSlotPicker {...defaultProps} slots={slots} />);
    expect(screen.queryByText("Lunch")).toBeNull();
    expect(screen.queryByText("Late Night")).toBeNull();
    expect(screen.getByText("Dinner")).toBeDefined();
  });
});
