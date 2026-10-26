import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
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
  }),
  day("2026-10-31", { bookingOpen: { ...OPEN, online: false } }),
  day("2026-11-01", { closures: [{ ruleId: "r2", targetKind: "venue", from: 0, to: 2880 }] }),
];

function renderCalendar(props: Partial<React.ComponentProps<typeof AvailabilityCalendar>> = {}) {
  const onOpenDay = vi.fn();
  const onAnchorChange = vi.fn();
  const utils = render(
    <main>
      <AvailabilityCalendar
        view="week"
        anchor="2026-10-30"
        today="2026-10-28"
        days={WEEK}
        isLoading={false}
        onOpenDay={onOpenDay}
        onAnchorChange={onAnchorChange}
        {...props}
      />
    </main>
  );
  return { ...utils, onOpenDay, onAnchorChange };
}

describe("AvailabilityCalendar", () => {
  it("names each cell with its date, label, service count and closure band", () => {
    renderCalendar();
    expect(screen.getByRole("grid", { name: "Availability calendar" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Friday, October 30: Special hours, 2 services, closed 10:00 PM – 11:00 PM",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Monday, October 26: Closed/ })).toBeInTheDocument();
  });

  it("marks the day that holds an unsaved draft with a dot and says so in its name", () => {
    const { container } = renderCalendar({ draftDate: "2026-10-30" });
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

  it("keeps a single tab stop on the anchor day", () => {
    renderCalendar();
    const stops = screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
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
    expect(screen.getAllByRole("button")).toHaveLength(7);
  });

  it("lays a month out as whole Monday-first weeks", () => {
    renderCalendar({ view: "month", anchor: "2026-10-15", days: [] });
    expect(screen.getAllByRole("button")).toHaveLength(35);
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
  });

  it("has no axe violations", async () => {
    const { container } = renderCalendar();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
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

  it("lists one row per day of the anchor month only, with weekday and date visible", () => {
    setViewportWidth(1024);
    renderCalendar({ view: "month", anchor: "2026-10-15", days: MONTH_DAYS });
    const list = screen.getByRole("list", { name: "Availability calendar" });
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(31);
    expect(within(rows[0]!).getByText("Thu, Oct 1")).toBeInTheDocument();
    expect(within(rows[30]!).getByText("Sat, Oct 31")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Weeknight")).toBeInTheDocument();
  });

  it("opens the day drawer from a row and marks today", () => {
    setViewportWidth(500);
    const { onOpenDay } = renderCalendar({
      view: "month",
      anchor: "2026-10-15",
      today: "2026-10-28",
      days: MONTH_DAYS,
    });
    expect(screen.getByRole("button", { name: /Wednesday, October 28/ })).toHaveAttribute(
      "aria-current",
      "date"
    );
    fireEvent.click(screen.getByRole("button", { name: /Friday, October 30/ }));
    expect(onOpenDay).toHaveBeenCalledWith("2026-10-30");
  });

  it("shows the closure band in the row", () => {
    setViewportWidth(500);
    renderCalendar({ view: "month", anchor: "2026-10-15", days: WEEK });
    const row = screen.getByRole("button", { name: /Friday, October 30/ });
    expect(within(row).getByText("Closed 10:00 PM – 11:00 PM")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    setViewportWidth(500);
    const { container } = renderCalendar({ view: "month", anchor: "2026-10-15", days: MONTH_DAYS });
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
