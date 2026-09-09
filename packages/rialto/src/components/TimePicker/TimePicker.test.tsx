/**
 * Unit tests for the TimePicker: trigger display, open-on-click, interval
 * options, HH:mm value shape, min/max + predicate disabling, keyboard
 * operation, and focus return to the trigger on select and Escape.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimePicker } from "./TimePicker";

const user = userEvent.setup();

function renderPicker(overrides: Partial<React.ComponentProps<typeof TimePicker>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <TimePicker label="Time" value="09:00" onChange={onChange} locale="en-US" {...overrides} />
  );
  return { onChange, trigger: screen.getByLabelText("Time"), ...utils };
}

function option(iso: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-time="${iso}"]`);
  if (!el) throw new Error(`No option for ${iso}`);
  return el;
}

describe("TimePicker", () => {
  it("formats the selected HH:mm value on the read-only trigger", () => {
    const { trigger } = renderPicker({ value: "09:30" });
    expect(trigger).toHaveAttribute("readonly");
    expect((trigger as HTMLInputElement).value).toContain("9:30");
  });

  it("shows an empty trigger when value is null", () => {
    const { trigger } = renderPicker({ value: null });
    expect((trigger as HTMLInputElement).value).toBe("");
  });

  it("opens the listbox popover on trigger click", async () => {
    const { trigger } = renderPicker();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("renders one option per interval step (default 15 min = 96 slots)", async () => {
    const { trigger } = renderPicker();
    await user.click(trigger);
    expect(screen.getAllByRole("option")).toHaveLength(96);
  });

  it("honours a custom step (60 min = 24 slots)", async () => {
    const { trigger } = renderPicker({ step: 60 });
    await user.click(trigger);
    expect(screen.getAllByRole("option")).toHaveLength(24);
  });

  it("selecting an option fires onChange with HH:mm, closes, and returns focus to the trigger", async () => {
    const { trigger, onChange } = renderPicker({ step: 60 });
    await user.click(trigger);
    await user.click(option("10:00"));

    expect(onChange).toHaveBeenCalledWith("10:00");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // The Popover remounts closed on select; focus lands on the fresh trigger.
    expect(document.activeElement).toBe(screen.getByLabelText("Time"));
  });

  it("Escape closes the popover and returns focus to the trigger", async () => {
    const { trigger } = renderPicker({ step: 60 });
    await user.click(trigger);
    act(() => option("09:00").focus());

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Time"));
  });

  it("disables out-of-range options when min/max bounds are set", async () => {
    const { trigger } = renderPicker({ step: 60, min: "09:00", max: "17:00" });
    await user.click(trigger);
    expect(option("08:00")).toHaveAttribute("aria-disabled", "true");
    expect(option("18:00")).toHaveAttribute("aria-disabled", "true");
    expect(option("12:00")).not.toHaveAttribute("aria-disabled");
  });

  it("lets isTimeDisabled win over bounds", async () => {
    const { trigger } = renderPicker({
      step: 60,
      min: "09:00",
      max: "17:00",
      isTimeDisabled: (t) => t === "12:00",
    });
    await user.click(trigger);
    // Predicate authoritative: out-of-bounds 08:00 stays enabled, 12:00 disabled.
    expect(option("08:00")).not.toHaveAttribute("aria-disabled");
    expect(option("12:00")).toHaveAttribute("aria-disabled", "true");
  });

  it("marks the selected slot with aria-selected", async () => {
    const { trigger } = renderPicker({ step: 60, value: "10:00" });
    await user.click(trigger);
    expect(option("10:00")).toHaveAttribute("aria-selected", "true");
    expect(option("09:00")).toHaveAttribute("aria-selected", "false");
  });

  it("is keyboard operable: ArrowDown moves the active option and Enter selects it", async () => {
    const { trigger, onChange } = renderPicker({ step: 60, value: "09:00" });
    await user.click(trigger);
    act(() => option("09:00").focus());

    await user.keyboard("{ArrowDown}");
    expect(option("10:00")).toHaveAttribute("data-active", "true");

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("10:00");
  });

  it("skips disabled options during keyboard navigation", async () => {
    const { trigger } = renderPicker({
      step: 60,
      value: "09:00",
      isTimeDisabled: (t) => t === "10:00",
    });
    await user.click(trigger);
    act(() => option("09:00").focus());

    await user.keyboard("{ArrowDown}");
    // 10:00 is disabled → active lands on 11:00.
    expect(option("11:00")).toHaveAttribute("data-active", "true");
  });

  it("wires aria-expanded, aria-haspopup, and aria-controls on the trigger, toggling on open", async () => {
    const { trigger } = renderPicker();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    const controlsId = trigger.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toHaveAttribute("id", controlsId as string);
  });
});
