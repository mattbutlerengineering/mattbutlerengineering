import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TimeSlot } from "@mbe/types";
import { TimeSlotPicker } from "./TimeSlotPicker.js";

// Renders with the real rialto components (TimeSlotPicker.test.tsx mocks
// `Text` as a <span>, which hides the element each one actually renders).
describe("TimeSlotPicker markup", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-20T10:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("never nests a paragraph inside a paragraph in the selected summary (#8824)", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const slot: TimeSlot = {
      time: "2026-05-20T18:00:00",
      available: true,
      tables: [{ id: "t1" }, { id: "t2" }] as unknown as TimeSlot["tables"],
    };
    const { container } = render(
      <TimeSlotPicker
        slots={[slot]}
        selectedSlot={slot}
        isLoading={false}
        error={null}
        onSelectSlot={vi.fn()}
        onBack={vi.fn()}
        date="2026-05-20"
        partySize={2}
      />
    );

    expect(screen.getByText(/2 tables available/)).toBeDefined();
    expect(container.querySelector("p p")).toBeNull();
    const nestingWarnings = consoleError.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === "string" && arg.includes("cannot be a descendant of"))
    );
    expect(nestingWarnings).toEqual([]);
  });
});
