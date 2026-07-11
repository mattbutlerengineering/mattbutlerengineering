/**
 * Unit tests for the Calendar component: value round-trip, min/max + predicate
 * disabling, keyboard navigation, and ARIA grid structure.
 */
import { describe, it, expect, vi } from "vitest";
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
