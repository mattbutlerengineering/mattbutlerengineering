/**
 * A panel aligned to its trigger can start or end outside a 375px viewport.
 * The hook shifts it in, and leaves a panel that already fits on its CSS position.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { render } from "@testing-library/react";
import { useShiftIntoViewport } from "./useShiftIntoViewport";

function rect(left: number, width: number): DOMRect {
  return {
    left,
    top: 80,
    width,
    height: 40,
    right: left + width,
    bottom: 120,
    x: left,
    y: 80,
    toJSON: () => ({}),
  } as DOMRect;
}

function Panel({ active, label }: { active: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useShiftIntoViewport(active, ref);
  return (
    <div style={{ position: "relative" }}>
      <div ref={ref} role="menu" aria-label={label} style={{ position: "absolute" }} />
    </div>
  );
}

function mockLayout(viewportWidth: number, panelLeft: number, panelWidth: number) {
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(viewportWidth);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(panelWidth);
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    return this.getAttribute("role") === "menu" ? this.parentElement : null;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    // The trigger wrapper sits at x=40. The panel's rect is the overflowing one.
    if (this.getAttribute("role") === "menu") return rect(panelLeft, panelWidth);
    if (this.querySelector("[role='menu']")) return rect(40, 120);
    return rect(0, 0);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useShiftIntoViewport", () => {
  it("shifts a panel that starts left of a 375px viewport onto the margin", () => {
    mockLayout(375, -29, 180);
    const { getByRole } = render(<Panel active label="Actions" />);
    // Viewport start is 8; the wrapper is at x=40, so the inset is 8 - 40.
    expect(getByRole("menu").style.insetInlineStart).toBe("-32px");
  });

  it("shifts a panel that ends past the right edge back inside", () => {
    mockLayout(375, 236, 200);
    const { getByRole } = render(<Panel active label="Configuration" />);
    // Clamped viewport start is 167; relative to the wrapper at x=40 that is 127.
    expect(getByRole("menu").style.insetInlineStart).toBe("127px");
    expect(getByRole("menu").style.insetInlineEnd).toBe("auto");
  });

  it("leaves a panel that already fits on its stylesheet position", () => {
    mockLayout(1280, 400, 180);
    const { getByRole } = render(<Panel active label="Actions" />);
    expect(getByRole("menu").style.insetInlineStart).toBe("");
    expect(getByRole("menu").style.insetInlineEnd).toBe("");
  });

  it("does not move a closed panel", () => {
    mockLayout(375, -29, 180);
    const { getByRole } = render(<Panel active={false} label="Actions" />);
    expect(getByRole("menu").style.insetInlineStart).toBe("");
  });
});
