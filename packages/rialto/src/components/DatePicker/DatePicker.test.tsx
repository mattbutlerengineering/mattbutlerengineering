/**
 * Unit tests for the DatePicker: trigger display, open-on-click, and focus
 * return to the trigger on select and Escape.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "./DatePicker";

const user = userEvent.setup();

function renderPicker(overrides: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <DatePicker label="Date" value="2024-06-10" onChange={onChange} locale="en-US" {...overrides} />
  );
  return { onChange, trigger: screen.getByLabelText("Date"), ...utils };
}

function cell(container: HTMLElement, iso: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-date="${iso}"]`);
  if (!el) throw new Error(`No day cell for ${iso}`);
  return el;
}

describe("DatePicker", () => {
  it("formats the selected value on the read-only trigger", () => {
    const { trigger } = renderPicker();
    expect(trigger).toHaveAttribute("readonly");
    expect((trigger as HTMLInputElement).value).toContain("2024");
    expect((trigger as HTMLInputElement).value).toContain("Jun");
  });

  it("shows an empty trigger when value is null", () => {
    const { trigger } = renderPicker({ value: null });
    expect((trigger as HTMLInputElement).value).toBe("");
  });

  it("opens the calendar popover on trigger click", async () => {
    const { trigger } = renderPicker();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("selecting a day fires onChange, closes the popover, and returns focus to the trigger", async () => {
    const { trigger, onChange, container } = renderPicker();
    await user.click(trigger);
    await user.click(cell(container, "2024-06-20"));

    expect(onChange).toHaveBeenCalledWith("2024-06-20");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    // The Popover remounts closed on select; focus lands on the fresh trigger.
    expect(document.activeElement).toBe(screen.getByLabelText("Date"));
  });

  it("Escape closes the popover and returns focus to the trigger", async () => {
    const { trigger, container } = renderPicker();
    await user.click(trigger);
    act(() => cell(container, "2024-06-10").focus());

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("Date"));
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
