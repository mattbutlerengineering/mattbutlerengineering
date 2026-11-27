/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeSlotPicker } from "./TimeSlotPicker.js";
import type { TimeSlot } from "@mbe/types";

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

const EARLY = { id: "vs_early", name: "Early Seating" };
const DINNER = { id: "vs_dinner", name: "Dinner" };

function makeSlot(time: string, available = true, service?: TimeSlot["service"]): TimeSlot {
  return service ? { time, available, service } : { time, available };
}

describe("TimeSlotPicker", () => {
  // Fixed clock (Date only), device-local 10:00 on the fixtures' day (2026-05-20):
  // every fixture slot is later than "now" and the date is not a future date.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-20T10:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not offer a slot that is already past (now - 30min)", () => {
    vi.setSystemTime(new Date("2026-05-20T18:00:00Z"));
    const slots = [makeSlot("2026-05-20T17:30:00Z"), makeSlot("2026-05-20T18:30:00Z")];
    render(
      <TimeSlotPicker {...defaultProps} slots={slots} date="2026-05-20" venueTimezone="UTC" />
    );
    expect(screen.queryByText("5:30 PM")).toBeNull();
    expect(screen.getByText("6:30 PM")).toBeDefined();
  });

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

  describe("grouping by venue service", () => {
    const optionTexts = (listbox: HTMLElement) =>
      Array.from(listbox.querySelectorAll("[role=option]")).map((o) => o.textContent);

    it("gives each of two services its own headed section, in opening order", () => {
      // Out of time order on the wire: the section order follows the times, not the payload.
      const slots = [
        makeSlot("2026-05-20T19:00:00", true, DINNER),
        makeSlot("2026-05-20T17:30:00", true, EARLY),
        makeSlot("2026-05-20T17:00:00", true, EARLY),
        makeSlot("2026-05-20T19:30:00", true, DINNER),
      ];
      render(<TimeSlotPicker {...defaultProps} slots={slots} />);
      const headings = screen.getAllByRole("heading").map((h) => h.textContent);
      expect(headings).toEqual(["Early Seating", "Dinner"]);
      const early = screen.getByRole("listbox", { name: "Available Early Seating times" });
      const dinner = screen.getByRole("listbox", { name: "Available Dinner times" });
      expect(optionTexts(early)).toEqual(["5:00 PM", "5:30 PM"]);
      expect(optionTexts(dinner)).toEqual(["7:00 PM", "7:30 PM"]);
    });

    it("shows the venue's service name exactly as typed, never a clock band", () => {
      const slots = [
        makeSlot("2026-05-20T12:00:00", true, { id: "vs_1", name: "brunch & bubbles" }),
        makeSlot("2026-05-20T21:00:00", true, { id: "vs_2", name: "After Hours" }),
      ];
      render(<TimeSlotPicker {...defaultProps} slots={slots} />);
      expect(screen.getByRole("heading", { name: "brunch & bubbles" })).toBeDefined();
      expect(screen.getByRole("heading", { name: "After Hours" })).toBeDefined();
      expect(screen.queryByText("Lunch")).toBeNull();
      expect(screen.queryByText("Late Night")).toBeNull();
    });

    it("shows one unheaded list named Available times when the venue has one service", () => {
      const slots = [
        makeSlot("2026-05-20T12:00:00", true, DINNER),
        makeSlot("2026-05-20T18:00:00", true, DINNER),
      ];
      render(<TimeSlotPicker {...defaultProps} slots={slots} />);
      expect(screen.queryAllByRole("heading")).toHaveLength(0);
      const listbox = screen.getByRole("listbox", { name: "Available times" });
      expect(optionTexts(listbox)).toEqual(["12:00 PM", "6:00 PM"]);
    });

    it("shows one unheaded list when slots carry no service (legacy hours)", () => {
      const slots = [makeSlot("2026-05-20T18:00:00"), makeSlot("2026-05-20T12:00:00")];
      render(<TimeSlotPicker {...defaultProps} slots={slots} />);
      expect(screen.queryAllByRole("heading")).toHaveLength(0);
      expect(screen.getAllByRole("listbox")).toHaveLength(1);
      const listbox = screen.getByRole("listbox", { name: "Available times" });
      expect(optionTexts(listbox)).toEqual(["12:00 PM", "6:00 PM"]);
    });

    it("falls back to one unheaded list when only some slots carry a service", () => {
      const slots = [
        makeSlot("2026-05-20T17:00:00", true, EARLY),
        makeSlot("2026-05-20T19:00:00"),
        makeSlot("2026-05-20T19:30:00", true, DINNER),
      ];
      render(<TimeSlotPicker {...defaultProps} slots={slots} />);
      expect(screen.queryAllByRole("heading")).toHaveLength(0);
      const listbox = screen.getByRole("listbox", { name: "Available times" });
      expect(optionTexts(listbox)).toEqual(["5:00 PM", "7:00 PM", "7:30 PM"]);
    });

    it("puts a service's after-midnight times in a second list inside its section, named for the next day", () => {
      const late = { id: "vs_late", name: "Late Seating" };
      const slots = [
        makeSlot("2026-05-20T18:00:00", true, DINNER),
        makeSlot("2026-05-20T22:00:00", true, late),
        makeSlot("2026-05-21T00:30:00", true, late),
      ];
      const { container } = render(<TimeSlotPicker {...defaultProps} slots={slots} />);
      const afterMidnight = screen.getByRole("listbox", {
        name: /^Available Late Seating times, after midnight on .*May 21/,
      });
      expect(optionTexts(afterMidnight)).toEqual(["12:30 AM"]);
      const sameDay = screen.getByRole("listbox", { name: "Available Late Seating times" });
      expect(optionTexts(sameDay)).toEqual(["10:00 PM"]);
      // Both lists sit under the Late Seating heading, not in a section of their own.
      const lateHeading = screen.getByRole("heading", { name: "Late Seating" });
      expect(lateHeading.parentElement?.contains(afterMidnight)).toBe(true);
      expect(lateHeading.parentElement?.contains(sameDay)).toBe(true);
      expect(container.querySelectorAll("h3")).toHaveLength(2);
    });

    it("splits after-midnight times out of the unheaded list too", () => {
      const slots = [makeSlot("2026-05-20T22:00:00"), makeSlot("2026-05-21T00:30:00")];
      render(<TimeSlotPicker {...defaultProps} slots={slots} />);
      expect(screen.queryAllByRole("heading")).toHaveLength(0);
      const afterMidnight = screen.getByRole("listbox", {
        name: /^Available times, after midnight on .*May 21/,
      });
      expect(optionTexts(afterMidnight)).toEqual(["12:30 AM"]);
      expect(optionTexts(screen.getByRole("listbox", { name: "Available times" }))).toEqual([
        "10:00 PM",
      ]);
    });
  });

  it("shows the closure message and a way to other dates when the date is closed", () => {
    const onBack = vi.fn();
    render(
      <TimeSlotPicker {...defaultProps} onBack={onBack} closure="Closed for a private event" />
    );
    expect(screen.getByText("Closed for a private event")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "See other dates" }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.queryByText("No available times")).toBeNull();
  });

  it("shows the paused state with the phone only when one is given", () => {
    const { rerender } = render(
      <TimeSlotPicker
        {...defaultProps}
        bookingPaused={{ message: "Back at nine.", phone: "(555) 123-4567" }}
      />
    );
    expect(screen.getByText("Online booking is paused right now")).toBeDefined();
    expect(screen.getByText(/Back at nine\./)).toBeDefined();
    expect(screen.getByText(/Call \(555\) 123-4567/)).toBeDefined();

    rerender(<TimeSlotPicker {...defaultProps} bookingPaused={{ message: "Back at nine." }} />);
    expect(screen.queryByText(/Call/)).toBeNull();
  });

  it("shows the not-configured state with the venue phone", () => {
    render(<TimeSlotPicker {...defaultProps} hasOperatingHours={false} phone="(555) 987-6543" />);
    expect(screen.getByText("Not taking online bookings yet")).toBeDefined();
    expect(screen.getByText(/Call \(555\) 987-6543/)).toBeDefined();
  });

  it("after a mid-booking closure offers up to three nearby times and another date", () => {
    const onBack = vi.fn();
    const slots = [
      makeSlot("2026-05-20T17:00:00"),
      makeSlot("2026-05-20T18:30:00"),
      makeSlot("2026-05-20T19:00:00"),
      makeSlot("2026-05-20T19:30:00"),
      makeSlot("2026-05-20T21:30:00"),
    ];
    render(
      <TimeSlotPicker
        {...defaultProps}
        slots={slots}
        onBack={onBack}
        closedMidBooking={{
          message: "Closed for a private event",
          lostTime: "2026-05-20T19:00:00",
        }}
      />
    );
    expect(screen.getByText("This time just closed")).toBeDefined();
    expect(screen.getByText("Closed for a private event")).toBeDefined();
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["6:30 PM", "7:00 PM", "7:30 PM"]);
    fireEvent.click(screen.getByRole("button", { name: "Pick another date" }));
    expect(onBack).toHaveBeenCalled();
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

  describe("keyboard navigation", () => {
    it("scopes roving tabindex to each service's listbox independently", () => {
      const slots = [
        makeSlot("2026-05-20T17:00:00", true, EARLY),
        makeSlot("2026-05-20T17:30:00", true, EARLY),
        makeSlot("2026-05-20T19:00:00", true, DINNER),
      ];
      render(<TimeSlotPicker {...defaultProps} slots={slots} />);

      const listboxes = screen.getAllByRole("listbox");
      expect(listboxes).toHaveLength(2);

      const earlyOptions = screen.getAllByRole("option").slice(0, 2);
      fireEvent.keyDown(earlyOptions[0]!, { key: "ArrowDown" });

      const optionsAfter = screen.getAllByRole("option");
      // Early Seating's second option becomes the roving tab stop...
      expect(optionsAfter[0]?.getAttribute("tabindex")).toBe("-1");
      expect(optionsAfter[1]?.getAttribute("tabindex")).toBe("0");
      // ...while Dinner's only option is untouched (unaffected by Early Seating's nav).
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

  // #4979: "Estimated wait: ~30 min" was shown for any date with no slots,
  // including dates days out — where a walk-in wait estimate is meaningless.
  describe("wait estimate only shown for a same-day date", () => {
    function futureDateString(daysFromNow: number): string {
      const d = new Date();
      d.setDate(d.getDate() + daysFromNow);
      return d.toISOString().split("T")[0]!;
    }

    it("does NOT show a wait estimate for a future date", () => {
      render(
        <TimeSlotPicker
          {...defaultProps}
          date={futureDateString(5)}
          slots={[]}
          onJoinWaitlist={vi.fn()}
          estimatedWaitMinutes={25}
        />
      );
      expect(screen.queryByText(/~25 min/)).toBeNull();
      expect(screen.getByText("Try a different date or party size.")).toBeDefined();
    });

    it("still offers Join Waitlist for a future date, just without the false estimate", () => {
      render(
        <TimeSlotPicker
          {...defaultProps}
          date={futureDateString(5)}
          slots={[]}
          onJoinWaitlist={vi.fn()}
          estimatedWaitMinutes={25}
        />
      );
      expect(screen.getByText("Join Waitlist")).toBeDefined();
    });
  });

  describe("venue timezone", () => {
    it("renders slot times in the venue's timezone, not the guest's device timezone (#4976)", () => {
      const originalTz = process.env.TZ;
      process.env.TZ = "America/Los_Angeles";
      try {
        // 17:00Z on 2026-05-21 is 1:00 PM in New York (EDT, UTC-4) but
        // 10:00 AM on a Los Angeles device (PDT, UTC-7) — the bug rendered
        // the latter with no indication a timezone was in play.
        const slot = makeSlot("2026-05-21T17:00:00Z");
        render(
          <TimeSlotPicker
            {...defaultProps}
            slots={[slot]}
            date="2026-05-21"
            venueTimezone="America/New_York"
          />
        );
        expect(screen.getByText("1:00 PM")).toBeDefined();
        expect(screen.queryByText("10:00 AM")).toBeNull();
      } finally {
        process.env.TZ = originalTz;
      }
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
      const setHoursBtn = screen.getByText("Set up regular week");
      fireEvent.click(setHoursBtn);
      expect(onSetHours).toHaveBeenCalled();
    });

    it("shows a clearer message than 'No available times' for the guest audience", () => {
      render(
        <TimeSlotPicker {...defaultProps} slots={[]} hasOperatingHours={false} audience="guest" />
      );

      expect(screen.queryByText("No available times")).toBeNull();
      expect(screen.queryByText("Set up regular week")).toBeNull();
      expect(screen.getByTestId("empty-state")).toBeDefined();
    });

    it("defaults to the guest audience when not specified", () => {
      render(<TimeSlotPicker {...defaultProps} slots={[]} hasOperatingHours={false} />);
      expect(screen.queryByText("Set up regular week")).toBeNull();
      expect(screen.queryByText("No available times")).toBeNull();
    });

    it("does not show the no-hours prompt when hours are configured but the date is fully booked (no regression)", () => {
      render(
        <TimeSlotPicker {...defaultProps} slots={[]} hasOperatingHours={true} audience="staff" />
      );
      expect(screen.getByText("No available times")).toBeDefined();
      expect(screen.queryByText("Set up regular week")).toBeNull();
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
