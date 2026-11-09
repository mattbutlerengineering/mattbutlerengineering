/**
 * Popover viewport containment (#8569): on a plain page (no Dialog) the panel
 * must flip to the side with room, clamp horizontally and scroll when taller
 * than the room, at desktop and phone viewport sizes.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover } from "./Popover";
import { Button } from "../Button/Button";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const rect = ({ left, top, width, height }: Box): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

/** Fake layout: the wrapper sits at `anchor`; the panel wants `panel` size. */
function mockLayout(viewport: { width: number; height: number }, anchor: Box, panel: Box) {
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(viewport.width);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(viewport.height);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(panel.width);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(panel.height);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    return this.getAttribute("role") === "dialog" ? rect(panel) : rect(anchor);
  });
}

async function openPanel() {
  render(
    <Popover trigger={<Button>Tonight</Button>} title="Tonight" placement="bottom">
      <p>Tall content</p>
    </Popover>
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Tonight" }));
  return screen.getByRole("dialog");
}

const px = (value: string) => Number.parseFloat(value);

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  { name: "1512x855", width: 1512, height: 855 },
  { name: "375x667", width: 375, height: 667 },
])("Popover on a plain page at $name", ({ width, height }) => {
  const viewport = { width, height };

  it("caps a tall panel to the room below and lets it scroll", async () => {
    mockLayout(
      viewport,
      { left: width / 2 - 40, top: 60, width: 80, height: 32 },
      {
        left: 0,
        top: 0,
        width: 320,
        height: 1400,
      }
    );
    const panel = await openPanel();
    expect(panel.style.top).toBe("100px"); // 60 + 32 + 8 gap
    const maxHeight = px(panel.style.maxHeight);
    expect(maxHeight).toBeGreaterThan(0);
    expect(px(panel.style.top) + maxHeight).toBeLessThanOrEqual(height);
  });

  it("flips above the trigger when there is more room there", async () => {
    mockLayout(
      viewport,
      { left: width / 2 - 40, top: height - 60, width: 80, height: 32 },
      {
        left: 0,
        top: 0,
        width: 280,
        height: 300,
      }
    );
    const panel = await openPanel();
    expect(panel.style.top).toBe("auto");
    expect(px(panel.style.bottom)).toBe(height - (height - 60) + 8);
  });

  it("clamps horizontally when the trigger hugs the right edge", async () => {
    mockLayout(
      viewport,
      { left: width - 60, top: 60, width: 50, height: 32 },
      {
        left: 0,
        top: 0,
        width: 320,
        height: 200,
      }
    );
    const panel = await openPanel();
    const left = px(panel.style.left);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 320).toBeLessThanOrEqual(width - 8);
  });
});
