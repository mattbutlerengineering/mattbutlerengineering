/**
 * Unit tests for the DateRange inline range calendar: range selection semantics
 * (start→end ordering, swap, same-day, clearing), disabled-date interaction,
 * keyboard navigation, and ARIA range structure.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRange } from "./DateRange";
import type { DateRangeValue } from "./DateRange";

const user = userEvent.setup();

const EMPTY: DateRangeValue = { start: null, end: null };

/** Local calendar Date at midnight for a `yyyy-mm-dd` string. */
function d(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1);
}

/** Extract `yyyy-mm-dd` from a local Date (mirrors the component boundary). */
function iso(date: Date | null): string | null {
  if (!date) return null;
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderRange(overrides: Partial<React.ComponentProps<typeof DateRange>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <DateRange value={EMPTY} onChange={onChange} weekStartsOn={0} locale="en-US" {...overrides} />
  );
  return { onChange, ...utils };
}

function cell(container: HTMLElement, isoDate: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-date="${isoDate}"]`);
  if (!el) throw new Error(`No day cell for ${isoDate}`);
  return el;
}

function activeIso(): string | null {
  return document.activeElement?.getAttribute("data-date") ?? null;
}

/** Assert the last onChange call carried a range with the given ISO endpoints. */
function expectRange(onChange: ReturnType<typeof vi.fn>, start: string | null, end: string | null) {
  const arg = onChange.mock.calls.at(-1)?.[0] as DateRangeValue;
  expect(iso(arg.start)).toBe(start);
  expect(iso(arg.end)).toBe(end);
}

describe("DateRange — ARIA structure", () => {
  it("renders a multiselectable grid with a weekday header and 42 gridcells", () => {
    renderRange({ value: { start: d("2024-06-01"), end: null } });
    const grid = screen.getByRole("grid");
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveAttribute("aria-multiselectable", "true");
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  });

  it("marks every day in the committed range with aria-selected", () => {
    const { container } = renderRange({ value: { start: d("2024-06-10"), end: d("2024-06-12") } });
    expect(cell(container, "2024-06-10")).toHaveAttribute("aria-selected", "true");
    expect(cell(container, "2024-06-11")).toHaveAttribute("aria-selected", "true");
    expect(cell(container, "2024-06-12")).toHaveAttribute("aria-selected", "true");
    expect(cell(container, "2024-06-13")).toHaveAttribute("aria-selected", "false");
    expect(cell(container, "2024-06-09")).toHaveAttribute("aria-selected", "false");
  });
});

describe("DateRange — selection semantics", () => {
  it("first click sets start and clears end", async () => {
    const { container, onChange } = renderRange();
    // An empty value shows today's month; click the roving-focus day (today).
    const focusable = container.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]');
    const target = focusable?.getAttribute("data-date");
    if (!target) throw new Error("No roving-focus day cell");
    await user.click(focusable!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expectRange(onChange, target, null);
  });

  it("second click sets end when after start", async () => {
    const { container, onChange } = renderRange({ value: { start: d("2024-06-10"), end: null } });
    await user.click(cell(container, "2024-06-15"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expectRange(onChange, "2024-06-10", "2024-06-15");
  });

  it("swaps endpoints when the second click is before the start", async () => {
    const { container, onChange } = renderRange({ value: { start: d("2024-06-15"), end: null } });
    await user.click(cell(container, "2024-06-10"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expectRange(onChange, "2024-06-10", "2024-06-15");
  });

  it("allows a same-day range (start === end)", async () => {
    const { container, onChange } = renderRange({ value: { start: d("2024-06-10"), end: null } });
    await user.click(cell(container, "2024-06-10"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expectRange(onChange, "2024-06-10", "2024-06-10");
  });

  it("clears the range and starts fresh when a complete range exists", async () => {
    const { container, onChange } = renderRange({
      value: { start: d("2024-06-10"), end: d("2024-06-15") },
    });
    await user.click(cell(container, "2024-06-20"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expectRange(onChange, "2024-06-20", null);
  });
});

describe("DateRange — disabled dates", () => {
  it("disables and refuses dates outside min/max", async () => {
    const { container, onChange } = renderRange({
      value: { start: d("2024-06-01"), end: d("2024-06-01") },
      min: d("2024-06-05"),
      max: d("2024-06-20"),
    });
    expect(cell(container, "2024-06-03")).toHaveAttribute("aria-disabled", "true");
    expect(cell(container, "2024-06-25")).toHaveAttribute("aria-disabled", "true");
    await user.click(cell(container, "2024-06-03"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lets the isDateDisabled predicate win over range bounds", async () => {
    const { container, onChange } = renderRange({
      value: { start: d("2024-06-01"), end: d("2024-06-01") },
      min: d("2024-06-05"),
      isDateDisabled: (date) => iso(date) === "2024-06-10",
    });
    expect(cell(container, "2024-06-10")).toHaveAttribute("aria-disabled", "true");
    // Predicate false → enabled even though below min (predicate is authoritative).
    expect(cell(container, "2024-06-03")).not.toHaveAttribute("aria-disabled");
    await user.click(cell(container, "2024-06-10"));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(cell(container, "2024-06-03"));
    expectRange(onChange, "2024-06-03", null);
  });
});

describe("DateRange — keyboard navigation", () => {
  it("moves the roving focus with arrows / Home / End / PageDown", async () => {
    const { container } = renderRange({ value: { start: d("2024-06-10"), end: null } });
    act(() => cell(container, "2024-06-10").focus());
    await user.keyboard("{ArrowRight}");
    expect(activeIso()).toBe("2024-06-11");
    await user.keyboard("{ArrowDown}");
    expect(activeIso()).toBe("2024-06-18");
    await user.keyboard("{Home}");
    expect(activeIso()).toBe("2024-06-16"); // Sunday-first week start
    await user.keyboard("{End}");
    expect(activeIso()).toBe("2024-06-22");
    await user.keyboard("{PageDown}");
    expect(activeIso()).toBe("2024-07-22");
  });

  it("selects the focused day with Enter", async () => {
    const { container, onChange } = renderRange({ value: { start: d("2024-06-10"), end: null } });
    act(() => cell(container, "2024-06-10").focus());
    await user.keyboard("{ArrowRight}{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expectRange(onChange, "2024-06-10", "2024-06-11");
  });
});

describe("DateRange — month navigation", () => {
  it("advances to the next month without losing the selection", async () => {
    renderRange({ value: { start: d("2024-06-10"), end: d("2024-06-15") } });
    await user.click(screen.getByRole("button", { name: /next month/i }));
    expect(screen.getByRole("grid")).toHaveAttribute("aria-label", expect.stringContaining("July"));
  });
});
