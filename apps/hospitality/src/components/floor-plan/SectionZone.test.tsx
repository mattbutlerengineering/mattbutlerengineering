import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import React from "react";
import type { SectionZoneData } from "./SectionZone.js";

vi.mock("react-konva", () => ({
  Group: ({ children, name }: { children?: React.ReactNode; name?: string }) => (
    <div data-testid="zone" role="group" aria-label={name}>
      {children}
    </div>
  ),
  Rect: ({
    x,
    y,
    width,
    height,
    fill,
    listening,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    listening?: boolean;
  }) => (
    <div
      data-testid="zone-rect"
      data-x={x}
      data-y={y}
      data-width={width}
      data-height={height}
      data-fill={fill}
      data-listening={String(listening)}
    />
  ),
  Text: ({ text }: { text: string }) => <span>{text}</span>,
}));

import { SectionZone } from "./SectionZone.js";

const AXE = { rules: { "color-contrast": { enabled: false } } };
const zone: SectionZoneData = {
  id: "s1",
  name: "Patio",
  color: "#3366cc",
  x: 10,
  y: 20,
  width: 200,
  height: 150,
};

describe("SectionZone", () => {
  it("draws a tinted rectangle at the zone's geometry with its name", () => {
    render(<SectionZone zone={zone} />);
    const rect = screen.getByTestId("zone-rect");
    expect(rect.dataset.x).toBe("10");
    expect(rect.dataset.y).toBe("20");
    expect(rect.dataset.width).toBe("200");
    expect(rect.dataset.height).toBe("150");
    expect(rect.dataset.fill).toBe("#3366cc");
    expect(screen.getByText("Patio")).toBeTruthy();
  });

  it("never captures pointer events, so tables above it stay draggable", () => {
    render(<SectionZone zone={zone} />);
    expect(screen.getByTestId("zone-rect").dataset.listening).toBe("false");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <SectionZone zone={zone} />
      </main>
    );
    expect((await axe(container, AXE)).violations).toEqual([]);
  });
});
