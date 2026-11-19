/**
 * Unit tests for the Calendar component: value round-trip, min/max + predicate
 * disabling, keyboard navigation, and ARIA grid structure.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calendar } from "./Calendar";

const user = userEvent.setup();

/** Render a Calendar pinned to June 2024, Sunday-first, for deterministic nav. */
function renderCalendar(overrides: Partial<React.ComponentProps<typeof Calendar>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <Calendar value="2024-06-10" onChange={onChange} weekStartsOn={0} {...overrides} />
  );
  return { onChange, ...utils };
}

function cell(container: HTMLElement, iso: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-date="${iso}"]`);
  if (!el) throw new Error(`No day cell for ${iso}`);
  return el;
}

function activeIso(): string | null {
  return document.activeElement?.getAttribute("data-date") ?? null;
}

describe("Calendar — ARIA structure", () => {
  it("renders a grid with a weekday header row and day gridcells", () => {
    renderCalendar();
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    // 6 weeks × 7 days.
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });

  it("marks the selected day with aria-selected", () => {
    const { container } = renderCalendar({ value: "2024-06-15" });
    expect(cell(container, "2024-06-15")).toHaveAttribute("aria-selected", "true");
    expect(cell(container, "2024-06-14")).toHaveAttribute("aria-selected", "false");
  });

  it("gives exactly one day a tabindex of 0 (roving tabindex)", () => {
    const { container } = renderCalendar({ value: "2024-06-15" });
    const tabbable = container.querySelectorAll('[role="gridcell"][tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute("data-date", "2024-06-15");
  });
});

describe("Calendar — value round-trip", () => {
  it("emits the ISO string of a clicked day", async () => {
    const { container, onChange } = renderCalendar();
    await user.click(cell(container, "2024-06-20"));
    expect(onChange).toHaveBeenCalledWith("2024-06-20");
  });

  it("renders with value=null without a selected day", () => {
    renderCalendar({ value: null });
    expect(screen.queryByRole("gridcell", { selected: true })).not.toBeInTheDocument();
  });
});

describe("Calendar — min/max + predicate disabling", () => {
  it("disables and refuses dates outside min/max", async () => {
    const { container, onChange } = renderCalendar({ min: "2024-06-05", max: "2024-06-20" });
    expect(cell(container, "2024-06-03")).toHaveAttribute("aria-disabled", "true");
    expect(cell(container, "2024-06-25")).toHaveAttribute("aria-disabled", "true");
    expect(cell(container, "2024-06-10")).not.toHaveAttribute("aria-disabled");

    await user.click(cell(container, "2024-06-03"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lets the predicate win over range bounds", async () => {
    const { container, onChange } = renderCalendar({
      min: "2024-06-05",
      isDateDisabled: (iso) => iso === "2024-06-10",
    });
    // Predicate true → disabled even though in range.
    expect(cell(container, "2024-06-10")).toHaveAttribute("aria-disabled", "true");
    // Predicate false → enabled even though below min (predicate wins).
    expect(cell(container, "2024-06-03")).not.toHaveAttribute("aria-disabled");

    await user.click(cell(container, "2024-06-10"));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(cell(container, "2024-06-03"));
    expect(onChange).toHaveBeenCalledWith("2024-06-03");
  });

  it("opens on the min date's month when there is no value and min is after today", () => {
    // A field whose earliest date is in a later month (a "To" after a chosen "From") would
    // otherwise open on a month where every day is disabled.
    const { container } = renderCalendar({ value: null, min: "2099-03-10" });
    expect(cell(container, "2099-03-10")).not.toHaveAttribute("aria-disabled");
    const tabbable = container.querySelectorAll('[role="gridcell"][tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute("data-date", "2099-03-10");
  });

  describe("with today pinned to 2099-03-10", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date(2099, 2, 10, 12) });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("opens on today when min is today", () => {
      const { container } = renderCalendar({ value: null, min: "2099-03-10" });
      const tabbable = container.querySelectorAll('[role="gridcell"][tabindex="0"]');
      expect(tabbable).toHaveLength(1);
      expect(tabbable[0]).toHaveAttribute("data-date", "2099-03-10");
      expect(cell(container, "2099-03-10")).not.toHaveAttribute("aria-disabled");
      expect(cell(container, "2099-03-09")).toHaveAttribute("aria-disabled", "true");
    });

    it("opens on min's month when max is before min, with every day disabled and no crash", () => {
      const { container } = renderCalendar({ value: null, min: "2099-05-10", max: "2099-05-01" });
      expect(cell(container, "2099-05-10")).toHaveAttribute("aria-disabled", "true");
      expect(cell(container, "2099-05-01")).toHaveAttribute("aria-disabled", "true");
      expect(container.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
    });

    it("ignores a min that is not a date and opens on today's month", () => {
      const { container } = renderCalendar({ value: null, min: "soon" });
      expect(cell(container, "2099-03-10")).toBeInTheDocument();
      const tabbable = container.querySelectorAll('[role="gridcell"][tabindex="0"]');
      expect(tabbable[0]).toHaveAttribute("data-date", "2099-03-10");
    });
  });

  it("still opens on today's month when min is in the past", () => {
    const { container } = renderCalendar({ value: null, min: "2000-01-01" });
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(cell(container, iso)).toBeInTheDocument();
  });

  it("opens on defaultMonth's month, ahead of a future min, when there is no value", () => {
    const { container } = renderCalendar({
      value: null,
      min: "2099-03-10",
      defaultMonth: "2098-11-20",
    });
    const tabbable = container.querySelectorAll('[role="gridcell"][tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute("data-date", "2098-11-20");
  });

  it("opens on the value's month when both value and defaultMonth are given", () => {
    const { container } = renderCalendar({ defaultMonth: "2098-11-20" });
    expect(container.querySelector('[role="gridcell"][tabindex="0"]')).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});

describe("Calendar — getDateLabel", () => {
  it("uses the label as the day's accessible name and leaves other days unnamed", () => {
    const { container } = renderCalendar({
      getDateLabel: (iso) => (iso === "2024-06-12" ? "June 12, closed, private event" : undefined),
    });
    expect(cell(container, "2024-06-12")).toHaveAttribute(
      "aria-label",
      "June 12, closed, private event"
    );
    expect(cell(container, "2024-06-13")).not.toHaveAttribute("aria-label");
  });

  it("keeps a labelled disabled day focusable and unselectable", async () => {
    const { container, onChange } = renderCalendar({
      isDateDisabled: (iso) => iso === "2024-06-12",
      getDateLabel: (iso) => (iso === "2024-06-12" ? "June 12, closed" : undefined),
    });
    const closed = cell(container, "2024-06-12");
    expect(closed).toHaveAttribute("aria-disabled", "true");
    await user.click(closed);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("gridcell", { name: "June 12, closed" })).toBe(closed);
  });
});

describe("Calendar — keyboard navigation", () => {
  it("ArrowRight / ArrowLeft move by one day", async () => {
    const { container } = renderCalendar();
    act(() => cell(container, "2024-06-10").focus());
    await user.keyboard("{ArrowRight}");
    expect(activeIso()).toBe("2024-06-11");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(activeIso()).toBe("2024-06-09");
  });

  it("ArrowDown / ArrowUp move by one week", async () => {
    const { container } = renderCalendar();
    act(() => cell(container, "2024-06-10").focus());
    await user.keyboard("{ArrowDown}");
    expect(activeIso()).toBe("2024-06-17");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(activeIso()).toBe("2024-06-03");
  });

  it("Home / End jump to the start and end of the week", async () => {
    const { container } = renderCalendar();
    act(() => cell(container, "2024-06-12").focus());
    await user.keyboard("{Home}");
    expect(activeIso()).toBe("2024-06-09"); // Sunday-first week start
    await user.keyboard("{End}");
    expect(activeIso()).toBe("2024-06-15"); // Saturday
  });

  it("PageDown / PageUp move by one month and follow the grid", async () => {
    const { container } = renderCalendar();
    act(() => cell(container, "2024-06-10").focus());
    await user.keyboard("{PageDown}");
    expect(activeIso()).toBe("2024-07-10");
    expect(screen.getByRole("grid")).toHaveAttribute("aria-label", expect.stringContaining("July"));
    await user.keyboard("{PageUp}{PageUp}");
    expect(activeIso()).toBe("2024-05-10");
  });

  it("Enter selects the focused day", async () => {
    const { container, onChange } = renderCalendar();
    act(() => cell(container, "2024-06-10").focus());
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("2024-06-11");
  });

  it("Space selects the focused day", async () => {
    const { container, onChange } = renderCalendar();
    act(() => cell(container, "2024-06-10").focus());
    await user.keyboard("[Space]");
    expect(onChange).toHaveBeenCalledWith("2024-06-10");
  });
});

describe("Calendar — month navigation buttons", () => {
  it("advances to the next month without stealing focus", async () => {
    renderCalendar();
    const next = screen.getByRole("button", { name: /next month/i });
    await user.click(next);
    expect(screen.getByRole("grid")).toHaveAttribute("aria-label", expect.stringContaining("July"));
  });

  it("returns to the previous month", async () => {
    renderCalendar();
    await user.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByRole("grid")).toHaveAttribute("aria-label", expect.stringContaining("May"));
  });
});

describe("Calendar — bounded month", () => {
  const BOUNDS = { min: "2026-07-05", max: "2026-07-25" };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on today clamped into min/max, focused on a selectable day", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 18, 12) });
    const { container } = renderCalendar({ value: null, ...BOUNDS });
    expect(screen.getByRole("grid")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/July\s+2026/)
    );
    const focusable = container.querySelector('[role="gridcell"][tabindex="0"]');
    expect(focusable).toHaveAttribute("data-date", "2026-07-25");
    expect(focusable).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: /previous month/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next month/i })).toBeDisabled();
  });

  it("opens on today when today is inside the bounds, with both month buttons disabled", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 6, 10, 12) });
    const { container } = renderCalendar({ value: null, ...BOUNDS });
    expect(container.querySelector('[role="gridcell"][tabindex="0"]')).toHaveAttribute(
      "data-date",
      "2026-07-10"
    );
    expect(screen.getByRole("button", { name: /previous month/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next month/i })).toBeDisabled();
  });

  it("disables only the month button that would leave a wider range", () => {
    renderCalendar({ value: "2024-07-10", min: "2024-06-15", max: "2024-07-25" });
    expect(screen.getByRole("button", { name: /previous month/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /next month/i })).toBeDisabled();
  });

  it("does not leave the range when a disabled month button is activated", async () => {
    renderCalendar({ value: "2026-07-18", ...BOUNDS });
    const previous = screen.getByRole("button", { name: /previous month/i });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    await user.click(previous);
    expect(screen.getByRole("grid")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/July\s+2026/)
    );
  });

  it("clamps PageUp and PageDown so the visible month stays inside the range", async () => {
    const { container } = renderCalendar({ value: "2026-07-18", ...BOUNDS });
    act(() => cell(container, "2026-07-18").focus());
    await user.keyboard("{PageDown}");
    expect(activeIso()).toBe("2026-07-25");
    expect(screen.getByRole("grid")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/July\s+2026/)
    );
    await user.keyboard("{PageUp}");
    expect(activeIso()).toBe("2026-07-05");
    expect(cell(container, "2026-07-05")).not.toHaveAttribute("aria-disabled");
  });

  it("clamps a month jump onto the last in-range day when the target month still overlaps", async () => {
    const { container } = renderCalendar({
      value: "2024-06-18",
      min: "2024-06-01",
      max: "2024-07-10",
    });
    act(() => cell(container, "2024-06-18").focus());
    await user.keyboard("{PageDown}");
    expect(activeIso()).toBe("2024-07-10");
    expect(screen.getByRole("grid")).toHaveAttribute("aria-label", expect.stringContaining("July"));
  });

  it("still moves across months that stay inside the range", async () => {
    const { container } = renderCalendar({
      value: "2024-06-10",
      min: "2024-05-01",
      max: "2024-08-31",
    });
    expect(screen.getByRole("button", { name: /next month/i })).toBeEnabled();
    act(() => cell(container, "2024-06-10").focus());
    await user.keyboard("{PageDown}");
    expect(activeIso()).toBe("2024-07-10");
    await user.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByRole("grid")).toHaveAttribute("aria-label", expect.stringContaining("June"));
    expect(container.querySelector('[role="gridcell"][tabindex="0"]')).toHaveAttribute(
      "data-date",
      "2024-06-10"
    );
  });

  it("stops arrow keys on min and max, and still crosses into an overlapping month", async () => {
    // Roving focus follows component state, so each edge starts on its own value.
    const atMin = renderCalendar({ value: "2024-06-05", min: "2024-06-05", max: "2024-06-20" });
    act(() => cell(atMin.container, "2024-06-05").focus());
    await user.keyboard("{ArrowLeft}");
    expect(activeIso()).toBe("2024-06-05");

    const atMax = renderCalendar({ value: "2024-06-20", min: "2024-06-05", max: "2024-06-20" });
    act(() => cell(atMax.container, "2024-06-20").focus());
    await user.keyboard("{ArrowRight}");
    expect(activeIso()).toBe("2024-06-20");

    const wider = renderCalendar({ value: "2024-06-01", min: "2024-05-20", max: "2024-07-10" });
    act(() => cell(wider.container, "2024-06-01").focus());
    await user.keyboard("{ArrowLeft}");
    expect(activeIso()).toBe("2024-05-31");
    expect(screen.getAllByRole("grid").at(-1)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("May")
    );
  });

  it("keeps month navigation when a predicate replaces min and max", async () => {
    const { container } = renderCalendar({
      value: "2024-06-10",
      min: "2024-06-05",
      max: "2024-06-20",
      isDateDisabled: (iso) => iso === "2024-06-12",
    });
    expect(screen.getByRole("button", { name: /previous month/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /next month/i })).toBeEnabled();
    act(() => cell(container, "2024-06-10").focus());
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(activeIso()).toBe("2024-06-12");
    expect(cell(container, "2024-06-12")).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{PageDown}");
    expect(activeIso()).toBe("2024-07-12");
  });

  it("lands on the first in-range day when the previous month only partly overlaps", async () => {
    const { container } = renderCalendar({
      value: "2024-07-10",
      min: "2024-06-15",
      max: "2024-07-25",
    });
    await user.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByRole("grid")).toHaveAttribute("aria-label", expect.stringContaining("June"));
    expect(container.querySelector('[role="gridcell"][tabindex="0"]')).toHaveAttribute(
      "data-date",
      "2024-06-15"
    );
    expect(cell(container, "2024-06-15")).not.toHaveAttribute("aria-disabled");
  });
});
