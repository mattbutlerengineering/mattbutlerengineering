import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { axe } from "vitest-axe";
import type { AvailabilityDaySummary } from "@mbe/types";
import { AvailabilityCalendar } from "./AvailabilityCalendar.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const OPEN = { online: true, phone: true, waitlist: true };

function day(date: string, overrides: Partial<AvailabilityDaySummary> = {}) {
  return {
    serviceDate: date,
    label: "Weeknight",
    scheduleId: "s1",
    serviceCount: 1,
    closures: [],
    bookingOpen: OPEN,
    services: [],
    ...overrides,
  } satisfies AvailabilityDaySummary;
}

const WEEK = [
  day("2026-10-26", { label: "Closed", scheduleId: null, serviceCount: 0 }),
  day("2026-10-27"),
  day("2026-10-28"),
  day("2026-10-29"),
  day("2026-10-30", {
    label: "Special hours",
    serviceCount: 2,
    closures: [{ ruleId: "r1", targetKind: "venue", from: 1320, to: 1380 }],
    services: [
      { venueServiceId: "svc-1", name: "Lunch", opensAt: 660, lastSeatingAt: 810, closesAt: 840 },
      {
        venueServiceId: "svc-2",
        name: "Dinner",
        opensAt: 1080,
        lastSeatingAt: 1290,
        closesAt: 1320,
      },
    ],
  }),
  day("2026-10-31", { bookingOpen: { ...OPEN, online: false } }),
  day("2026-11-01", { closures: [{ ruleId: "r2", targetKind: "venue", from: 0, to: 2880 }] }),
];

function renderCalendar(props: Partial<React.ComponentProps<typeof AvailabilityCalendar>> = {}) {
  const onOpenDay = vi.fn();
  const onAnchorChange = vi.fn();
  const onSelectionChange = vi.fn();
  const utils = render(
    <main>
      <AvailabilityCalendar
        view="week"
        anchor="2026-10-30"
        today="2026-10-28"
        days={WEEK}
        isLoading={false}
        selection={[]}
        onSelectionChange={onSelectionChange}
        onOpenDay={onOpenDay}
        onAnchorChange={onAnchorChange}
        {...props}
      />
    </main>
  );
  return { ...utils, onOpenDay, onAnchorChange, onSelectionChange };
}

describe("AvailabilityCalendar", () => {
  it("names each cell with its date, label, closure band and services", () => {
    renderCalendar();
    expect(
      screen.getByRole("grid", { name: "Availability calendar, Oct 26 – Nov 1, 2026" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Friday, October 30: Special hours, closed 10:00 PM – 11:00 PM, Lunch 11:00 AM–2:00 PM, last seating 1:30 PM, Dinner 6:00 PM–10:00 PM, last seating 9:30 PM",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Monday, October 26: Closed/ })).toBeInTheDocument();
  });

  it("shows each service's hours as its own line", () => {
    renderCalendar();
    const cell = screen.getByRole("button", { name: /Friday, October 30/ });
    expect(
      within(cell).getByText("Lunch 11:00 AM–2:00 PM, last seating 1:30 PM")
    ).toBeInTheDocument();
    expect(
      within(cell).getByText("Dinner 6:00 PM–10:00 PM, last seating 9:30 PM")
    ).toBeInTheDocument();
  });

  it("names a holiday beside its day number and in the cell's name, and no other day", () => {
    const thanksgiving = day("2026-11-26");
    renderCalendar({
      view: "month",
      anchor: "2026-11-15",
      days: [thanksgiving, day("2026-11-25")],
    });
    const cell = screen.getByRole("button", { name: /^26 Thanksgiving, Thursday, November 26: / });
    expect(within(cell).getByText("Thanksgiving")).toBeInTheDocument();
    const before = screen.getByRole("button", { name: /^Wednesday, November 25:/ });
    expect(before.getAttribute("aria-label")).not.toMatch(/Thanksgiving/);
  });

  it("prints the opening and close, with the last seating after them", () => {
    const week = WEEK.map((d) =>
      d.serviceDate === "2026-10-30"
        ? {
            ...d,
            closures: [],
            serviceCount: 1,
            services: [
              {
                venueServiceId: "svc-2",
                name: "Dinner",
                opensAt: 1020,
                lastSeatingAt: 1275,
                closesAt: 1320,
              },
            ],
          }
        : d
    );
    renderCalendar({ days: week });
    const cell = screen.getByRole("button", { name: /Friday, October 30/ });
    expect(
      within(cell).getByText("Dinner 5:00 PM–10:00 PM, last seating 9:15 PM")
    ).toBeInTheDocument();
  });

  it("marks the day that holds an unsaved draft with a dot and says so in its name", () => {
    const { container } = renderCalendar({ draftDates: ["2026-10-30"] });
    expect(container.querySelectorAll("[data-draft-dot]")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /^Friday, October 30: .*, unsaved changes$/ })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /unsaved changes/ })).toHaveLength(1);
  });

  it("shows no dot when no draft is open", () => {
    const { container } = renderCalendar();
    expect(container.querySelector("[data-draft-dot]")).toBeNull();
  });

  it("says when a day is closed all day and when online booking is off", () => {
    renderCalendar();
    expect(
      screen.getByRole("button", { name: /Sunday, November 1: .*closed all day/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Saturday, October 31: .*online booking off/ })
    ).toBeInTheDocument();
  });

  it("shows the closure band as text, not colour alone", () => {
    renderCalendar();
    const cell = screen.getByRole("button", { name: /Friday, October 30/ });
    expect(within(cell).getByText("Closed 10:00 PM – 11:00 PM")).toBeInTheDocument();
  });

  it("marks today", () => {
    renderCalendar();
    expect(screen.getByRole("button", { name: /Wednesday, October 28/ })).toHaveAttribute(
      "aria-current",
      "date"
    );
  });

  it("opens the day drawer on activation", () => {
    const { onOpenDay } = renderCalendar();
    fireEvent.click(screen.getByRole("button", { name: /Friday, October 30/ }));
    expect(onOpenDay).toHaveBeenCalledWith("2026-10-30");
  });

  it("keeps the days to a single tab stop, on the anchor day", () => {
    const { container } = renderCalendar();
    const stops = [...container.querySelectorAll("[data-date]")].filter(
      (b) => b.getAttribute("tabindex") === "0"
    );
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAccessibleName(/Friday, October 30/);
  });

  it("moves the anchor with arrow, Home, End and page keys", () => {
    const { onAnchorChange } = renderCalendar();
    const cell = screen.getByRole("button", { name: /Friday, October 30/ });
    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(onAnchorChange).toHaveBeenLastCalledWith("2026-10-31");
    fireEvent.keyDown(cell, { key: "ArrowDown" });
    expect(onAnchorChange).toHaveBeenLastCalledWith("2026-11-06");
    fireEvent.keyDown(cell, { key: "Home" });
    expect(onAnchorChange).toHaveBeenLastCalledWith("2026-10-26");
    fireEvent.keyDown(cell, { key: "End" });
    expect(onAnchorChange).toHaveBeenLastCalledWith("2026-11-01");
    fireEvent.keyDown(cell, { key: "PageDown" });
    expect(onAnchorChange).toHaveBeenLastCalledWith("2026-11-30");
  });

  it("shows skeletons instead of labels while loading", () => {
    renderCalendar({ days: undefined, isLoading: true });
    expect(screen.queryByText("Weeknight")).not.toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(7);
  });

  it("shows no skeleton once the read has failed: nothing is coming (#7979)", () => {
    const { container } = renderCalendar({ days: undefined, loadFailed: true });
    expect(container.querySelector('[class*="skeleton" i]')).toBeNull();
    expect(screen.getAllByRole("gridcell")).toHaveLength(7);
  });

  it("lays a month out as whole Monday-first weeks", () => {
    renderCalendar({ view: "month", anchor: "2026-10-15", days: [] });
    expect(screen.getAllByRole("gridcell")).toHaveLength(35);
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  });

  it("has no axe violations", async () => {
    const { container } = renderCalendar();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});

describe("AvailabilityCalendar column headers from the keyboard (#7980)", () => {
  const header = (weekday: string) =>
    screen.getByRole("button", { name: `Select every ${weekday}` });

  it("gives the header row one Tab stop", () => {
    renderCalendar();
    expect(header("Monday")).toHaveAttribute("tabindex", "0");
    expect(header("Tuesday")).toHaveAttribute("tabindex", "-1");
  });

  it("walks the headers with the arrows and carries the Tab stop along", () => {
    renderCalendar();
    header("Monday").focus();
    fireEvent.keyDown(header("Monday"), { key: "ArrowRight" });
    expect(header("Tuesday")).toHaveFocus();
    expect(header("Tuesday")).toHaveAttribute("tabindex", "0");
    expect(header("Monday")).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(header("Tuesday"), { key: "ArrowLeft" });
    expect(header("Monday")).toHaveFocus();
    fireEvent.keyDown(header("Monday"), { key: "ArrowLeft" });
    expect(header("Sunday")).toHaveFocus();
  });

  it("goes down into the column's first day", () => {
    const { onAnchorChange } = renderCalendar();
    header("Monday").focus();
    fireEvent.keyDown(header("Monday"), { key: "ArrowDown" });
    expect(onAnchorChange).toHaveBeenCalledWith("2026-10-26");
  });
});

/** A width-driven `matchMedia` so `useViewport` reports phone or tablet. */
function setViewportWidth(width: number) {
  window.matchMedia = vi.fn((query: string) => {
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    return {
      media: query,
      matches: max ? width <= Number(max[1]) : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  }) as unknown as typeof window.matchMedia;
}

describe("AvailabilityCalendar on a phone or tablet (agenda list)", () => {
  const MONTH_DAYS = Array.from({ length: 31 }, (_, i) =>
    day(`2026-10-${String(i + 1).padStart(2, "0")}`)
  );

  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("starts the month list at today, with weekday and date visible", () => {
    setViewportWidth(1024);
    renderCalendar({ view: "month", anchor: "2026-10-15", days: MONTH_DAYS });
    const list = screen.getByRole("list", { name: "Availability calendar, October 2026" });
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByText("Wed, Oct 28")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("Sat, Oct 31")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Weeknight")).toBeInTheDocument();
  });

  it("lists every day of a month that does not contain today", () => {
    setViewportWidth(1024);
    renderCalendar({ view: "month", anchor: "2026-10-15", today: "2026-11-02", days: MONTH_DAYS });
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(31);
    expect(within(rows[0]!).getByText("Thu, Oct 1")).toBeInTheDocument();
  });

  it("opens the day drawer from a row and marks today", () => {
    setViewportWidth(500);
    const { onOpenDay } = renderCalendar({
      view: "month",
      anchor: "2026-10-15",
      today: "2026-10-28",
      days: MONTH_DAYS,
    });
    expect(screen.getByRole("button", { name: /Wed, Oct 28/ })).toHaveAttribute(
      "aria-current",
      "date"
    );
    fireEvent.click(screen.getByRole("button", { name: /Fri, Oct 30/ }));
    expect(onOpenDay).toHaveBeenCalledWith("2026-10-30");
  });

  it("names a row with the date it shows, so speech matches sight (#7980)", () => {
    setViewportWidth(500);
    renderCalendar({ view: "month", anchor: "2026-10-15", today: "2026-10-28", days: MONTH_DAYS });
    expect(screen.getByRole("button", { name: "Fri, Oct 30: Weeknight" })).toBeInTheDocument();
  });

  it("Space picks a row without opening it (#7980)", () => {
    setViewportWidth(500);
    const { onOpenDay, onSelectionChange } = renderCalendar({
      view: "month",
      anchor: "2026-10-15",
      days: MONTH_DAYS,
    });
    fireEvent.keyDown(screen.getByRole("button", { name: /Oct 30/ }), { key: " " });
    expect(onSelectionChange).toHaveBeenCalledWith(["2026-10-30"]);
    expect(onOpenDay).not.toHaveBeenCalled();
  });

  it("while selecting, a tap picks instead of opening, even with nothing picked yet (#7980)", () => {
    setViewportWidth(500);
    const { onOpenDay, onSelectionChange } = renderCalendar({
      view: "month",
      anchor: "2026-10-15",
      days: MONTH_DAYS,
      selecting: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /Oct 30/ }));
    expect(onSelectionChange).toHaveBeenCalledWith(["2026-10-30"]);
    expect(onOpenDay).not.toHaveBeenCalled();
  });

  it("long-press on a row selects it and names it as selected", () => {
    vi.useFakeTimers();
    setViewportWidth(500);
    const onSelectionChange = vi.fn();
    const { rerender } = renderCalendar({
      view: "month",
      anchor: "2026-10-15",
      days: MONTH_DAYS,
      onSelectionChange,
    });
    const row = screen.getByRole("button", { name: /Fri, Oct 30/ });
    fireEvent.touchStart(row);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.touchEnd(row);
    expect(onSelectionChange).toHaveBeenCalledWith(["2026-10-30"]);
    rerender(
      <main>
        <AvailabilityCalendar
          view="month"
          anchor="2026-10-15"
          today="2026-10-28"
          days={MONTH_DAYS}
          isLoading={false}
          selection={["2026-10-30"]}
          onSelectionChange={onSelectionChange}
          onOpenDay={vi.fn()}
          onAnchorChange={vi.fn()}
        />
      </main>
    );
    expect(screen.getByRole("button", { name: /Fri, Oct 30.*, selected$/ })).toBeVisible();
    vi.useRealTimers();
  });

  it("shows the closure band in the row", () => {
    setViewportWidth(500);
    renderCalendar({ view: "month", anchor: "2026-10-15", days: WEEK });
    const row = screen.getByRole("button", { name: /Fri, Oct 30/ });
    expect(within(row).getByText("Closed 10:00 PM – 11:00 PM")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    setViewportWidth(500);
    const { container } = renderCalendar({ view: "month", anchor: "2026-10-15", days: MONTH_DAYS });
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});

/** A calendar that owns its selection, the way the page does. */
function Harness(props: {
  readonly view?: "week" | "month";
  readonly anchor?: string;
  readonly onDragChange?: (dragging: boolean) => void;
}) {
  const [selection, setSelection] = useState<string[]>([]);
  return (
    <main>
      <AvailabilityCalendar
        view={props.view ?? "week"}
        anchor={props.anchor ?? "2026-10-30"}
        today="2026-10-28"
        days={WEEK}
        isLoading={false}
        selection={selection}
        onSelectionChange={setSelection}
        onDragChange={props.onDragChange}
        onOpenDay={onOpenDayMock}
        onAnchorChange={vi.fn()}
      />
      <output data-testid="picked">{selection.join(",")}</output>
    </main>
  );
}
const onOpenDayMock = vi.fn();
const picked = () => screen.getByTestId("picked").textContent;
const cell = (re: RegExp) => screen.getByRole("button", { name: re });

describe("AvailabilityCalendar multi-select", () => {
  afterEach(() => {
    onOpenDayMock.mockReset();
    vi.useRealTimers();
  });

  it("selects a range by click-dragging and does not open a day", () => {
    render(<Harness />);
    fireEvent.mouseDown(cell(/Tuesday, October 27/));
    fireEvent.mouseEnter(cell(/Wednesday, October 28/), { buttons: 1 });
    fireEvent.mouseEnter(cell(/Thursday, October 29/), { buttons: 1 });
    fireEvent.mouseUp(cell(/Thursday, October 29/));
    fireEvent.click(cell(/Thursday, October 29/));
    expect(picked()).toBe("2026-10-27,2026-10-28,2026-10-29");
    expect(onOpenDayMock).not.toHaveBeenCalled();
  });

  describe("a drag whose mouseup never reached the window", () => {
    function strand(onDragChange: (dragging: boolean) => void) {
      render(<Harness onDragChange={onDragChange} />);
      fireEvent.mouseDown(cell(/Tuesday, October 27/));
      fireEvent.mouseEnter(cell(/Wednesday, October 28/), { buttons: 1 });
      expect(onDragChange).toHaveBeenLastCalledWith(true);
    }

    it("is over at the next press on a day, so the page stops holding the bar back", () => {
      const onDragChange = vi.fn();
      strand(onDragChange);
      fireEvent.mouseDown(cell(/Friday, October 30/));
      expect(onDragChange).toHaveBeenLastCalledWith(false);
    });

    it("is over at the next Ctrl-press on a day, and does not swallow that click", () => {
      const onDragChange = vi.fn();
      strand(onDragChange);
      fireEvent.mouseDown(cell(/Friday, October 30/), { ctrlKey: true });
      expect(onDragChange).toHaveBeenLastCalledWith(false);
      fireEvent.mouseUp(cell(/Friday, October 30/));
      fireEvent.click(cell(/Friday, October 30/), { ctrlKey: true });
      expect(picked()).toContain("2026-10-30");
    });

    it("is over at the next hover with no button held, which does not extend it", () => {
      const onDragChange = vi.fn();
      strand(onDragChange);
      const before = picked();
      fireEvent.mouseEnter(cell(/Friday, October 30/), { buttons: 0 });
      expect(onDragChange).toHaveBeenLastCalledWith(false);
      expect(picked()).toBe(before);
    });

    it("is over when the window loses focus, and moving on no longer extends it", () => {
      const onDragChange = vi.fn();
      strand(onDragChange);
      fireEvent.blur(window);
      expect(onDragChange).toHaveBeenLastCalledWith(false);
      const before = picked();
      fireEvent.mouseEnter(cell(/Friday, October 30/), { buttons: 1 });
      expect(picked()).toBe(before);
    });
  });

  it("extends from the last clicked day with Shift-click", () => {
    render(<Harness />);
    fireEvent.click(cell(/Tuesday, October 27/), { ctrlKey: true });
    fireEvent.click(cell(/Thursday, October 29/), { shiftKey: true });
    expect(picked()).toBe("2026-10-27,2026-10-28,2026-10-29");
  });

  it("adds and removes single days with Ctrl or Cmd-click", () => {
    render(<Harness />);
    fireEvent.click(cell(/Tuesday, October 27/), { ctrlKey: true });
    fireEvent.click(cell(/Friday, October 30/), { metaKey: true });
    expect(picked()).toBe("2026-10-27,2026-10-30");
    fireEvent.click(cell(/Tuesday, October 27/), { ctrlKey: true });
    expect(picked()).toBe("2026-10-30");
    expect(onOpenDayMock).not.toHaveBeenCalled();
  });

  it("marks selected days for assistive tech", () => {
    render(<Harness />);
    fireEvent.click(cell(/Friday, October 30/), { ctrlKey: true });
    expect(cell(/Friday, October 30/).closest("[role=gridcell]")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(cell(/Saturday, October 31/).closest("[role=gridcell]")).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("selects a weekday column of the month from its header", () => {
    render(<Harness view="month" anchor="2026-10-15" />);
    fireEvent.click(screen.getByRole("button", { name: "Select every Friday" }));
    expect(picked()).toBe("2026-10-02,2026-10-09,2026-10-16,2026-10-23,2026-10-30");
  });

  it("extends the selection with Shift+Arrow from the keyboard", () => {
    render(<Harness />);
    const friday = cell(/Friday, October 30/);
    fireEvent.keyDown(friday, { key: "ArrowRight", shiftKey: true });
    expect(picked()).toBe("2026-10-30,2026-10-31");
  });

  it("long-press selects a day, then taps toggle more", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const tue = cell(/Tuesday, October 27/);
    fireEvent.touchStart(tue);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.touchEnd(tue);
    expect(picked()).toBe("2026-10-27");
    fireEvent.click(cell(/Thursday, October 29/));
    expect(picked()).toBe("2026-10-27,2026-10-29");
    expect(onOpenDayMock).not.toHaveBeenCalled();
  });

  it("a short touch is a plain tap and does not select", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const tue = cell(/Tuesday, October 27/);
    fireEvent.touchStart(tue);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.touchEnd(tue);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(picked()).toBe("");
  });

  it("a plain click opens the day and leaves dropping the selection to the opener", () => {
    render(<Harness />);
    fireEvent.click(cell(/Tuesday, October 27/), { ctrlKey: true });
    fireEvent.click(cell(/Friday, October 30/));
    expect(onOpenDayMock).toHaveBeenCalledWith("2026-10-30");
    expect(picked()).toBe("2026-10-27");
  });

  it("Space toggles the focused day in the selection without opening the drawer", () => {
    render(<Harness />);
    const friday = cell(/Friday, October 30/);
    fireEvent.keyDown(friday, { key: " " });
    expect(picked()).toBe("2026-10-30");
    fireEvent.keyDown(friday, { key: " " });
    expect(picked()).toBe("");
    expect(onOpenDayMock).not.toHaveBeenCalled();
  });
});

describe("AvailabilityCalendar quiet month cells and legend (PRD 8)", () => {
  const dec = (d: number) => `2026-12-${String(d).padStart(2, "0")}`;
  const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  // December 2026: Mon–Thu on the Weeknights schedule, the rest on the regular week.
  const DECEMBER = Array.from({ length: 31 }, (_, i) => dec(i + 1)).map((date) =>
    weekday(date) <= 3
      ? day(date, { label: "Weeknights", scheduleId: "wk" })
      : day(date, { label: "Regular week", scheduleId: "reg" })
  );
  const EVE = day(dec(24), {
    label: "Weeknights",
    scheduleId: "wk",
    closures: [
      { ruleId: "c1", targetKind: "service", venueServiceId: "svc-1", from: 660, to: 900 },
    ],
    services: [
      { venueServiceId: "svc-1", name: "Lunch", opensAt: 660, lastSeatingAt: 810, closesAt: 900 },
    ],
  });
  const days = DECEMBER.map((d) => (d.serviceDate === dec(24) ? EVE : d));
  const month = (props: Partial<React.ComponentProps<typeof AvailabilityCalendar>> = {}) =>
    renderCalendar({
      view: "month",
      anchor: dec(15),
      today: "2026-11-08",
      days,
      regularScheduleId: "reg",
      ...props,
    });
  const cellOf = (name: RegExp) => screen.getByRole("button", { name });

  it("shows a regular day's date and nothing else", () => {
    month();
    const cell = cellOf(/^Friday, December 4:/);
    expect(cell).toHaveTextContent(/^4\s*$/);
  });

  it("names a cell with its visible text first (WCAG 2.5.3), chip and holiday included", async () => {
    const { container } = month({
      anchor: "2026-11-15",
      days: [
        day("2026-11-01", {
          label: "Closed",
          scheduleId: null,
          serviceCount: 0,
          closures: [{ ruleId: "c9", targetKind: "venue", from: 0, to: 2880 }],
        }),
        day("2026-11-26", { scheduleId: "reg" }),
      ],
    });
    expect(cellOf(/^1 Closed, Sunday, November 1:/)).toBeInTheDocument();
    expect(cellOf(/^26 Thanksgiving, Thursday, November 26:/)).toBeInTheDocument();
    const result = await axe(container, {
      rules: {
        "color-contrast": { enabled: false },
        "label-content-name-mismatch": { enabled: true },
      },
    });
    expect(result.violations).toEqual([]);
  });

  describe("accessible name starts with the visible text (WCAG 2.5.3)", () => {
    const AXE_NAME = {
      rules: {
        "color-contrast": { enabled: false },
        "label-content-name-mismatch": { enabled: true },
      },
    };
    const offline = { online: false, phone: true, waitlist: true };

    it("takes no booking chip on a regular-closed day: the muted Closed text alone", async () => {
      const { container } = month({
        anchor: "2026-11-15",
        days: [
          day("2026-11-01", {
            label: "Closed",
            scheduleId: null,
            serviceCount: 0,
            bookingOpen: offline,
          }),
        ],
      });
      const sunday = cellOf(/^1 Closed, Sunday, November 1:/);
      expect(sunday).toHaveTextContent(/^1\s*Closed\s*$/);
      expect(within(sunday).queryByText(/paused/)).toBeNull();
      expect((await axe(container, AXE_NAME)).violations).toEqual([]);
    });

    it("takes no booking chip on a day with a whole-day closure either", () => {
      month({
        anchor: "2026-11-15",
        days: [
          day("2026-11-01", {
            label: "Closed",
            scheduleId: null,
            serviceCount: 0,
            bookingOpen: offline,
            closures: [{ ruleId: "c9", targetKind: "venue", from: 0, to: 2880 }],
          }),
        ],
      });
      expect(cellOf(/^1 Closed, Sunday, November 1:/)).toHaveTextContent(/^1\s*Closed\s*$/);
    });

    it("a chip alone, and a holiday with a chip, read in the name as they do on screen", async () => {
      const { container } = month({
        anchor: "2026-11-15",
        days: [
          day("2026-11-03", { scheduleId: "reg", bookingOpen: offline }),
          day("2026-11-26", { scheduleId: "reg", bookingOpen: offline }),
        ],
      });
      expect(cellOf(/^3 Online paused, Tuesday, November 3:/)).toHaveTextContent(
        /^3\s*Online paused\s*$/
      );
      expect(
        cellOf(/^26 Thanksgiving Online paused, Thursday, November 26:/).textContent?.trim()
      ).toBe("26 Thanksgiving Online paused");
      expect((await axe(container, AXE_NAME)).violations).toEqual([]);
    });

    it("a holiday on a regular-closed day: date, holiday, then the muted Closed", async () => {
      const { container } = month({
        anchor: "2026-11-15",
        days: [day("2026-11-26", { label: "Closed", scheduleId: null, serviceCount: 0 })],
      });
      const cell = cellOf(/^26 Thanksgiving Closed, Thursday, November 26:/);
      expect(cell).toHaveTextContent(/^26\s*Thanksgiving\s*Closed\s*$/);
      expect((await axe(container, AXE_NAME)).violations).toEqual([]);
    });
  });

  it("shows another schedule's name as the chip", () => {
    month();
    expect(
      within(cellOf(/^1 Weeknights, Tuesday, December 1:/)).getByText("Weeknights")
    ).toBeInTheDocument();
  });

  it("ranks a service closure above the schedule and counts the schedule as +1", () => {
    month();
    const cell = cellOf(/^24 Christmas Eve Lunch closed \+1, Thursday, December 24:/);
    expect(within(cell).getByText("Lunch closed +1")).toBeInTheDocument();
    expect(within(cell).queryByText("Weeknights")).toBeNull();
  });

  it("keeps the accessible name's full description", () => {
    month();
    expect(cellOf(/^1 Weeknights, Tuesday, December 1:/)).toHaveAccessibleName(
      "1 Weeknights, Tuesday, December 1: Weeknights"
    );
    expect(
      cellOf(/^24 Christmas Eve Lunch closed \+1, Thursday, December 24:/).getAttribute(
        "aria-label"
      )
    ).toMatch(/Weeknights.*Lunch/);
  });

  it("states the month's differences above the grid, one list item each", () => {
    month();
    const heading = screen.getByText("This month:");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Weeknights · Mon–Thu",
      "Lunch closed · 1 day",
    ]);
    expect(heading.compareDocumentPosition(screen.getByRole("grid"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("does not call two closed days of one week a weekly pattern", () => {
    const closed = (d: number) =>
      day(dec(d), {
        label: "Closed",
        scheduleId: null,
        serviceCount: 0,
        closures: [{ ruleId: `c${d}`, targetKind: "venue", from: 0, to: 2880 }],
      });
    month({
      days: DECEMBER.map((d) =>
        [24, 25].includes(Number(d.serviceDate.slice(-2)))
          ? closed(Number(d.serviceDate.slice(-2)))
          : d
      ),
    });
    expect(screen.getByText("Closed · 2 days")).toBeInTheDocument();
  });

  it("reads a weekday the regular week is closed on as plain muted text, with no chip or legend entry", () => {
    month({
      days: DECEMBER.map((d) =>
        weekday(d.serviceDate) === 6
          ? { ...d, label: "Closed", scheduleId: null, serviceCount: 0 }
          : d
      ),
    });
    const sunday = cellOf(/^6 Closed, Sunday, December 6:/);
    expect(within(sunday).getByText("Closed")).toBeInTheDocument();
    expect(screen.queryByText(/^Closed ·/)).toBeNull();
  });

  it("gives a real whole-day closure the Closed chip and a legend entry", () => {
    month({
      days: DECEMBER.map((d) =>
        d.serviceDate === dec(5)
          ? {
              ...d,
              label: "Closed",
              scheduleId: null,
              serviceCount: 0,
              closures: [{ ruleId: "c5", targetKind: "venue" as const, from: 0, to: 2880 }],
            }
          : d
      ),
    });
    expect(
      within(cellOf(/^5 Closed, Saturday, December 5:/)).getByText("Closed")
    ).toBeInTheDocument();
    expect(screen.getByText("Closed · 1 day")).toBeInTheDocument();
  });

  it("shows no legend until the regular schedule is known", () => {
    month({ regularScheduleId: null });
    expect(screen.queryByText(/^This month:/)).toBeNull();
  });

  it("says the month is the regular week when no day differs", () => {
    month({ days: DECEMBER.map((d) => ({ ...d, label: "Regular week", scheduleId: "reg" })) });
    expect(screen.getByText("This month: your regular week")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows no legend in week view, and no legend until the days have loaded", () => {
    renderCalendar();
    expect(screen.queryByText(/^This month:/)).toBeNull();
  });

  it("leaves a greyed neighbouring-month day out of the legend", () => {
    month({
      days: [...days, day("2027-01-01", { label: "Closed", scheduleId: null, serviceCount: 0 })],
    });
    expect(screen.queryByText(/^Closed ·/)).toBeNull();
  });
});
