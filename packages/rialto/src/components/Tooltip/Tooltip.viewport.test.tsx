/** Tooltip viewport containment (#8569): text must not be clipped by the viewport edge. */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { Tooltip } from "./Tooltip";

const rect = (left: number, width: number): DOMRect =>
  ({
    left,
    top: 100,
    width,
    height: 24,
    right: left + width,
    bottom: 124,
    x: left,
    y: 100,
    toJSON: () => ({}),
  }) as DOMRect;

function mockLayout(viewportWidth: number, tooltipLeft: number, tooltipWidth: number) {
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(viewportWidth);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(tooltipWidth);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    return rect(this.getAttribute("role") === "tooltip" ? tooltipLeft : 0, tooltipWidth);
  });
}

async function showTooltip() {
  vi.useFakeTimers();
  render(
    <Tooltip content="Used on Nov 12" delay={0}>
      <button>Delete</button>
    </Tooltip>
  );
  fireEvent.mouseEnter(screen.getByRole("button").parentElement!);
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  return screen.getByRole("tooltip");
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Tooltip viewport containment", () => {
  it("shifts left when it would overflow the right edge", async () => {
    mockLayout(1512, 1450, 200); // 1450..1650 in a 1512 viewport
    const tip = await showTooltip();
    expect(Number.parseFloat(tip.style.marginLeft)).toBe(-(1650 - (1512 - 8)));
  });

  it("shifts right when it would overflow the left edge", async () => {
    mockLayout(375, -30, 200);
    const tip = await showTooltip();
    expect(Number.parseFloat(tip.style.marginLeft)).toBe(38);
  });

  it("does not move a tooltip that already fits", async () => {
    mockLayout(1512, 600, 200);
    const tip = await showTooltip();
    expect(tip.style.marginLeft).toBe("");
  });
});
