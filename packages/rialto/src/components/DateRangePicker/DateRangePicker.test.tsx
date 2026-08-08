/**
 * Unit tests for the DateRangePicker: trigger display, open-on-click, and
 * focus return to the trigger once a complete range is picked or on Escape.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangePicker } from "./DateRangePicker";
import type { DateRangeValue } from "../DateRange/DateRange";

const user = userEvent.setup();

const EMPTY: DateRangeValue = { start: null, end: null };

function renderPicker(overrides: Partial<React.ComponentProps<typeof DateRangePicker>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <DateRangePicker
      label="Dates"
      value={EMPTY}
      onChange={onChange}
      locale="en-US"
      {...overrides}
    />
  );
  return { onChange, trigger: screen.getByLabelText("Dates"), ...utils };
}

function cell(container: HTMLElement, iso: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-date="${iso}"]`);
  if (!el) throw new Error(`No day cell for ${iso}`);
  return el;
}

describe("DateRangePicker", () => {
  it("shows an empty trigger when no range is selected", () => {
    const { trigger } = renderPicker();
    expect(trigger).toHaveAttribute("readonly");
    expect((trigger as HTMLInputElement).value).toBe("");
  });

  it("formats a complete range on the read-only trigger", () => {
    const { trigger } = renderPicker({ value: { start: "2024-06-10", end: "2024-06-20" } });
    const value = (trigger as HTMLInputElement).value;
    expect(value).toContain("Jun 10");
    expect(value).toContain("Jun 20");
  });

  it("opens the range grid popover on trigger click", async () => {
    const { trigger } = renderPicker();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("picking only a start date keeps the popover open", async () => {
    // No start yet — the first click always sets a fresh start (never an end),
    // so the popover must stay open regardless of which day is clicked.
    const { trigger, onChange, container } = renderPicker();
    await user.click(trigger);
    const firstCell = container.querySelector<HTMLElement>("[data-date]");
    if (!firstCell) throw new Error("No day cells rendered");
    const iso = firstCell.getAttribute("data-date");

    await user.click(firstCell);

    expect(onChange).toHaveBeenCalledWith({ start: iso, end: null });
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("completing a range fires onChange, closes the popover, and returns focus to the trigger", async () => {
    const { trigger, onChange, container } = renderPicker({
      value: { start: "2024-06-10", end: null },
    });
    await user.click(trigger);
    await user.click(cell(container, "2024-06-20"));

    expect(onChange).toHaveBeenCalledWith({ start: "2024-06-10", end: "2024-06-20" });
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Dates"));
  });

  it("Escape closes the popover and returns focus to the trigger", async () => {
    const { trigger, container } = renderPicker({
      value: { start: "2024-06-01", end: null },
    });
    await user.click(trigger);
    act(() => cell(container, "2024-06-10").focus());

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Dates"));
  });
});
