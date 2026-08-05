/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeSlotPicker } from "./TimeSlotPicker.js";
import type { TimeSlot } from "@mbe/types";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, size, variant, ...props }: any) => (
    <button data-size={size} data-variant={variant} {...props}>
      {children}
    </button>
  ),
  Heading: ({ children, className }: any) => <h3 className={className}>{children}</h3>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
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
  EmptyState: ({ heading, description, action }: any) => (
    <div data-testid="empty-state">
      <span>{heading}</span>
      <span>{description}</span>
      {action}
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

  describe("keyboard navigation", () => {
    it("scopes roving tabindex to each period's listbox independently", () => {
      const slots = [
        makeSlot("2026-05-20T12:00:00"), // lunch
        makeSlot("2026-05-20T12:30:00"), // lunch
        makeSlot("2026-05-20T18:00:00"), // dinner
      ];
      render(<TimeSlotPicker {...defaultProps} slots={slots} />);

      const listboxes = screen.getAllByRole("listbox");
      expect(listboxes).toHaveLength(2);

      const lunchOptions = screen.getAllByRole("option").slice(0, 2);
      fireEvent.keyDown(lunchOptions[0]!, { key: "ArrowDown" });

      const optionsAfter = screen.getAllByRole("option");
      // Lunch's second option becomes the roving tab stop...
      expect(optionsAfter[1]?.getAttribute("tabindex")).toBe("0");
      // ...while dinner's only option is untouched (unaffected by lunch's nav).
      expect(optionsAfter[2]?.getAttribute("tabindex")).toBe("0");
    });

    it("selects the focused slot on Enter, matching click behavior", () => {
      const onSelectSlot = vi.fn();
      const slots = [makeSlot("2026-05-20T18:00:00"), makeSlot("2026-05-20T18:30:00")];
      render(<TimeSlotPicker {...defaultProps} slots={slots} onSelectSlot={onSelectSlot} />);

      const options = screen.getAllByRole("option");
      fireEvent.keyDown(options[0]!, { key: "ArrowDown" });
      fireEvent.keyDown(options[1]!, { key: "Enter" });
      expect(onSelectSlot).toHaveBeenCalledWith(slots[1]);
    });

    it("jumps to the last slot in the group on End", () => {
      const slots = [
        makeSlot("2026-05-20T18:00:00"),
        makeSlot("2026-05-20T18:30:00"),
        makeSlot("2026-05-20T19:00:00"),
      ];
      render(<TimeSlotPicker {...defaultProps} slots={slots} />);

      const options = screen.getAllByRole("option");
      fireEvent.keyDown(options[0]!, { key: "End" });

      const optionsAfter = screen.getAllByRole("option");
      expect(optionsAfter[2]?.getAttribute("tabindex")).toBe("0");
      expect(optionsAfter[0]?.getAttribute("tabindex")).toBe("-1");
    });
  });

  describe("waitlist option when no slots available", () => {
    it("shows Join Waitlist button when onJoinWaitlist is provided and slots are empty", () => {
      const onJoinWaitlist = vi.fn();
      render(<TimeSlotPicker {...defaultProps} slots={[]} onJoinWaitlist={onJoinWaitlist} />);
      expect(screen.getByText("Join Waitlist")).toBeDefined();
    });

    it("calls onJoinWaitlist when button is clicked", () => {
      const onJoinWaitlist = vi.fn();
      render(<TimeSlotPicker {...defaultProps} slots={[]} onJoinWaitlist={onJoinWaitlist} />);
      fireEvent.click(screen.getByText("Join Waitlist"));
      expect(onJoinWaitlist).toHaveBeenCalled();
    });

    it("shows estimated wait minutes when provided with no slots and onJoinWaitlist", () => {
      render(
        <TimeSlotPicker
          {...defaultProps}
          slots={[]}
          onJoinWaitlist={vi.fn()}
          estimatedWaitMinutes={25}
        />
      );
      expect(screen.getByText(/~25 min/)).toBeDefined();
    });

    it("does NOT show Join Waitlist button when onJoinWaitlist is not provided", () => {
      render(<TimeSlotPicker {...defaultProps} slots={[]} />);
      expect(screen.queryByText("Join Waitlist")).toBeNull();
    });

    it("does NOT show Join Waitlist button when slots are available", () => {
      const slots = [makeSlot("2026-05-20T18:00:00")];
      render(<TimeSlotPicker {...defaultProps} slots={slots} onJoinWaitlist={vi.fn()} />);
      expect(screen.queryByText("Join Waitlist")).toBeNull();
    });
  });

  describe("no operating hours configured", () => {
    it("shows a set-hours prompt with a working link for the staff audience", () => {
      const onSetHours = vi.fn();
      render(
        <TimeSlotPicker
          {...defaultProps}
          slots={[]}
          hasOperatingHours={false}
          audience="staff"
          onSetHours={onSetHours}
        />
      );

      expect(screen.queryByText("No available times")).toBeNull();
      const setHoursBtn = screen.getByText("Set Operating Hours");
      fireEvent.click(setHoursBtn);
      expect(onSetHours).toHaveBeenCalled();
    });

    it("shows a clearer message than 'No available times' for the guest audience", () => {
      render(
        <TimeSlotPicker {...defaultProps} slots={[]} hasOperatingHours={false} audience="guest" />
      );

      expect(screen.queryByText("No available times")).toBeNull();
      expect(screen.queryByText("Set Operating Hours")).toBeNull();
      expect(screen.getByTestId("empty-state")).toBeDefined();
    });

    it("defaults to the guest audience when not specified", () => {
      render(<TimeSlotPicker {...defaultProps} slots={[]} hasOperatingHours={false} />);
      expect(screen.queryByText("Set Operating Hours")).toBeNull();
      expect(screen.queryByText("No available times")).toBeNull();
    });

    it("does not show the no-hours prompt when hours are configured but the date is fully booked (no regression)", () => {
      render(
        <TimeSlotPicker {...defaultProps} slots={[]} hasOperatingHours={true} audience="staff" />
      );
      expect(screen.getByText("No available times")).toBeDefined();
      expect(screen.queryByText("Set Operating Hours")).toBeNull();
    });

    it("takes priority over the waitlist option when hours aren't configured", () => {
      render(
        <TimeSlotPicker
          {...defaultProps}
          slots={[]}
          hasOperatingHours={false}
          audience="guest"
          onJoinWaitlist={vi.fn()}
        />
      );
      expect(screen.queryByText("Join Waitlist")).toBeNull();
    });
  });
});
