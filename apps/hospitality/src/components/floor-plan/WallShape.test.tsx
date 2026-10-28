import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { WallLayout } from "@mbe/types";

vi.mock("react-konva", () => ({
  Group: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Line: ({
    strokeWidth,
    dash,
    stroke,
    onClick,
    lineCap,
    name,
  }: {
    strokeWidth: number;
    dash?: number[];
    stroke: string;
    onClick?: () => void;
    lineCap?: string;
    name?: string;
  }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-testid={name ?? "line"}
      data-width={strokeWidth}
      data-dash={dash ? "dashed" : "solid"}
      data-stroke={stroke}
      data-linecap={lineCap}
      onClick={onClick}
    />
  ),
  Circle: () => <div data-testid="handle" />,
}));

import { WallShape } from "./WallShape.js";

const wall: WallLayout = { id: "w1", x1: 0, y1: 0, x2: 100, y2: 0, thickness: 8 };

describe("WallShape", () => {
  it("renders a wall as one solid bar with square caps so corners close", () => {
    render(<WallShape wall={wall} isSelected={false} onSelect={() => {}} />);
    expect(screen.getByTestId("line").dataset.dash).toBe("solid");
    expect(screen.getByTestId("line").dataset.width).toBe("8");
    expect(screen.getByTestId("line").dataset.linecap).toBe("square");
    expect(screen.queryAllByTestId("window-jamb")).toHaveLength(0);
  });

  it("renders a window as a thin solid glass line between two jamb ticks, not a dash", () => {
    render(
      <WallShape wall={{ ...wall, wallType: "window" }} isSelected={false} onSelect={() => {}} />
    );
    const glass = screen.getByTestId("window-glass");
    expect(glass.dataset.dash).toBe("solid");
    expect(Number(glass.dataset.width)).toBeLessThan(wall.thickness);
    expect(screen.getAllByTestId("window-jamb")).toHaveLength(2);
    expect(screen.getByTestId("line").dataset.dash).toBe("solid");
  });

  it("selects on click and shows endpoint handles only when selected and draggable", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<WallShape wall={wall} isSelected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("line"));
    expect(onSelect).toHaveBeenCalledWith("w1");
    expect(screen.queryAllByTestId("handle")).toHaveLength(0);
    rerender(<WallShape wall={wall} isSelected onSelect={onSelect} onEndpointDrag={() => {}} />);
    expect(screen.getAllByTestId("handle")).toHaveLength(2);
  });
});

describe("WallShape memoization", () => {
  it("does not re-render when props are unchanged, and re-renders when isSelected flips", () => {
    let renderCount = 0;
    const tracked: WallLayout = { ...wall };
    Object.defineProperty(tracked, "x1", {
      get() {
        renderCount++;
        return 0;
      },
    });
    const onSelect = () => {};

    function Harness({ selected }: { selected: boolean }) {
      const [tick, setTick] = React.useState(0);
      return (
        <>
          <button
            data-testid="force-rerender"
            data-tick={tick}
            onClick={() => setTick((n) => n + 1)}
          />
          <WallShape wall={tracked} isSelected={selected} onSelect={onSelect} />
        </>
      );
    }

    const { rerender } = render(<Harness selected={false} />);
    const countAfterMount = renderCount;
    expect(countAfterMount).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("force-rerender"));
    expect(renderCount).toBe(countAfterMount);

    rerender(<Harness selected />);
    expect(renderCount).toBeGreaterThan(countAfterMount);
  });
});
