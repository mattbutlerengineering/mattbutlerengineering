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
  }: {
    strokeWidth: number;
    dash?: number[];
    stroke: string;
    onClick: () => void;
  }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-testid="line"
      data-width={strokeWidth}
      data-dash={dash ? "dashed" : "solid"}
      data-stroke={stroke}
      onClick={onClick}
    />
  ),
  Circle: () => <div data-testid="handle" />,
}));

import { WallShape } from "./WallShape.js";

const wall: WallLayout = { id: "w1", x1: 0, y1: 0, x2: 100, y2: 0, thickness: 8 };

describe("WallShape", () => {
  it("renders a wall solid and a window dashed", () => {
    const { rerender } = render(<WallShape wall={wall} isSelected={false} onSelect={() => {}} />);
    expect(screen.getByTestId("line").dataset.dash).toBe("solid");
    expect(screen.getByTestId("line").dataset.width).toBe("8");
    rerender(
      <WallShape wall={{ ...wall, wallType: "window" }} isSelected={false} onSelect={() => {}} />
    );
    expect(screen.getByTestId("line").dataset.dash).toBe("dashed");
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
