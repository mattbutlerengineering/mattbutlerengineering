import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeSlotListbox } from "./TimeSlotListbox.js";
import type { TimeSlot } from "@mbe/types";
import type { ComponentPropsWithRef } from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, ...props }: ComponentPropsWithRef<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

function makeSlot(time: string): TimeSlot {
  return { time, available: true };
}

describe("TimeSlotListbox", () => {
  const slots = [
    makeSlot("2026-05-20T18:00:00"),
    makeSlot("2026-05-20T18:30:00"),
    makeSlot("2026-05-20T19:00:00"),
  ];

  it("renders a listbox with only one option as a tab stop (roving tabindex)", () => {
    render(
      <TimeSlotListbox slots={slots} selectedSlot={null} onSelectSlot={vi.fn()} label="Dinner" />
    );
    const options = screen.getAllByRole("option");
    const tabStops = options.filter((el) => el.getAttribute("tabindex") === "0");
    expect(tabStops.length).toBe(1);
    expect(options[0]?.getAttribute("tabindex")).toBe("0");
  });

  it("moves the roving tab stop to the next option on ArrowDown", () => {
    render(
      <TimeSlotListbox slots={slots} selectedSlot={null} onSelectSlot={vi.fn()} label="Dinner" />
    );
    const options = screen.getAllByRole("option");
    fireEvent.keyDown(options[0]!, { key: "ArrowDown" });
    expect(options[0]?.getAttribute("tabindex")).toBe("-1");
    expect(options[1]?.getAttribute("tabindex")).toBe("0");
  });

  it("moves the roving tab stop to the previous option on ArrowUp", () => {
    render(
      <TimeSlotListbox
        slots={slots}
        selectedSlot={slots[1] ?? null}
        onSelectSlot={vi.fn()}
        label="Dinner"
      />
    );
    const options = screen.getAllByRole("option");
    fireEvent.keyDown(options[1]!, { key: "ArrowUp" });
    expect(options[0]?.getAttribute("tabindex")).toBe("0");
    expect(options[1]?.getAttribute("tabindex")).toBe("-1");
  });

  it("does not move past the last option on ArrowDown", () => {
    render(
      <TimeSlotListbox
        slots={slots}
        selectedSlot={slots[2] ?? null}
        onSelectSlot={vi.fn()}
        label="Dinner"
      />
    );
    const options = screen.getAllByRole("option");
    fireEvent.keyDown(options[2]!, { key: "ArrowDown" });
    expect(options[2]?.getAttribute("tabindex")).toBe("0");
  });

  it("jumps to the first option on Home", () => {
    render(
      <TimeSlotListbox
        slots={slots}
        selectedSlot={slots[2] ?? null}
        onSelectSlot={vi.fn()}
        label="Dinner"
      />
    );
    const options = screen.getAllByRole("option");
    fireEvent.keyDown(options[2]!, { key: "Home" });
    expect(options[0]?.getAttribute("tabindex")).toBe("0");
    expect(options[2]?.getAttribute("tabindex")).toBe("-1");
  });

  it("jumps to the last option on End", () => {
    render(
      <TimeSlotListbox slots={slots} selectedSlot={null} onSelectSlot={vi.fn()} label="Dinner" />
    );
    const options = screen.getAllByRole("option");
    fireEvent.keyDown(options[0]!, { key: "End" });
    expect(options[2]?.getAttribute("tabindex")).toBe("0");
  });

  it("selects the focused option on Enter", () => {
    const onSelectSlot = vi.fn();
    render(
      <TimeSlotListbox
        slots={slots}
        selectedSlot={null}
        onSelectSlot={onSelectSlot}
        label="Dinner"
      />
    );
    const options = screen.getAllByRole("option");
    fireEvent.keyDown(options[0]!, { key: "ArrowDown" });
    fireEvent.keyDown(options[1]!, { key: "Enter" });
    expect(onSelectSlot).toHaveBeenCalledWith(slots[1]);
  });

  it("selects the focused option on Space", () => {
    const onSelectSlot = vi.fn();
    render(
      <TimeSlotListbox
        slots={slots}
        selectedSlot={null}
        onSelectSlot={onSelectSlot}
        label="Dinner"
      />
    );
    const options = screen.getAllByRole("option");
    fireEvent.keyDown(options[0]!, { key: " " });
    expect(onSelectSlot).toHaveBeenCalledWith(slots[0]);
  });

  it("calls onSelectSlot and updates the roving tab stop on click", () => {
    const onSelectSlot = vi.fn();
    render(
      <TimeSlotListbox
        slots={slots}
        selectedSlot={null}
        onSelectSlot={onSelectSlot}
        label="Dinner"
      />
    );
    const options = screen.getAllByRole("option");
    fireEvent.click(options[2]!);
    expect(onSelectSlot).toHaveBeenCalledWith(slots[2]);
    expect(options[2]?.getAttribute("tabindex")).toBe("0");
  });

  it("preserves aria-selected on the selected option", () => {
    render(
      <TimeSlotListbox
        slots={slots}
        selectedSlot={slots[1] ?? null}
        onSelectSlot={vi.fn()}
        label="Dinner"
      />
    );
    const options = screen.getAllByRole("option");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
    expect(options[0]?.getAttribute("aria-selected")).toBe("false");
  });

  it("sets the accessible label on the listbox", () => {
    render(
      <TimeSlotListbox slots={slots} selectedSlot={null} onSelectSlot={vi.fn()} label="Dinner" />
    );
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-label", "Dinner");
  });
});
