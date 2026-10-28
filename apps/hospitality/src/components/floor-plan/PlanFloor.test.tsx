import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TEXTURE_PATTERN_SCALE } from "./floor-textures.js";

vi.mock("react-konva", () => ({
  Rect: ({
    name,
    x,
    y,
    width,
    height,
    fill,
    listening,
    fillPatternImage,
    fillPatternScale,
  }: {
    name?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fill?: string;
    listening?: boolean;
    fillPatternImage?: HTMLImageElement;
    fillPatternScale?: { x: number; y: number };
  }) => (
    <div
      data-testid={name}
      data-x={x}
      data-y={y}
      data-width={width}
      data-height={height}
      data-fill={fill}
      data-listening={String(listening)}
      data-has-pattern={String(Boolean(fillPatternImage))}
      data-pattern-scale={fillPatternScale ? `${fillPatternScale.x},${fillPatternScale.y}` : ""}
    />
  ),
}));

import { PlanFloor, PLAN_FLOOR_NAME } from "./PlanFloor.js";

const texture = { width: 64, height: 64 } as HTMLImageElement;

describe("PlanFloor", () => {
  it("paints nothing without a loaded texture, leaving the bare floor as before", () => {
    const { container } = render(<PlanFloor width={800} height={600} />);
    expect(container.innerHTML).toBe("");
  });

  it("tiles the texture over the whole plan, without capturing pointer events", () => {
    render(<PlanFloor width={800} height={600} texture={texture} />);
    const floor = screen.getByTestId(PLAN_FLOOR_NAME);
    expect(floor.dataset.x).toBe("0");
    expect(floor.dataset.y).toBe("0");
    expect(floor.dataset.width).toBe("800");
    expect(floor.dataset.height).toBe("600");
    expect(floor.dataset.hasPattern).toBe("true");
    expect(floor.dataset.fill).toBeUndefined();
    expect(floor.dataset.listening).toBe("false");
    expect(floor.dataset.patternScale).toBe(
      `${TEXTURE_PATTERN_SCALE.x},${TEXTURE_PATTERN_SCALE.y}`
    );
  });
});
