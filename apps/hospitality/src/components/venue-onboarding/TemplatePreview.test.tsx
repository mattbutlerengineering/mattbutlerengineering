import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TemplatePreview } from "./TemplatePreview.js";
import type { DraftTable } from "./floor-plan-draft.js";

function makeTable(overrides: Partial<DraftTable> & Pick<DraftTable, "localId">): DraftTable {
  return {
    name: "Table",
    capacity: 2,
    minCovers: 1,
    shape: "rectangle",
    x: 100,
    y: 100,
    ...overrides,
  };
}

describe("TemplatePreview", () => {
  it("renders one shape node per table plus the ground rect, for a 14-table shape mix", () => {
    const tables: DraftTable[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeTable({ localId: `sq-${i}`, shape: "square", x: 100 + i * 20, y: 80 })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeTable({ localId: `rect-${i}`, shape: "rectangle", x: 300 + i * 20, y: 200 })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeTable({ localId: `circle-${i}`, shape: "circle", x: 500 + i * 20, y: 400 })
      ),
    ];

    const { container } = render(<TemplatePreview tables={tables} />);

    const rects = container.querySelectorAll("rect");
    const circles = container.querySelectorAll("circle");

    // 5 squares + 5 rectangles + 1 ground rect = 11 rects; 4 circles.
    expect(rects.length).toBe(11);
    expect(circles.length).toBe(4);
    expect(rects.length + circles.length).toBe(15); // 14 tables + 1 ground
  });

  it("positions a square table at its centre offset by half its size", () => {
    const tables: DraftTable[] = [makeTable({ localId: "sq-1", shape: "square", x: 100, y: 80 })];

    const { container } = render(<TemplatePreview tables={tables} />);
    const rects = container.querySelectorAll("rect");
    const shapeRect = rects[rects.length - 1] as SVGRectElement;

    expect(shapeRect.getAttribute("x")).toBe("70");
    expect(shapeRect.getAttribute("y")).toBe("50");
    expect(shapeRect.getAttribute("width")).toBe("60");
    expect(shapeRect.getAttribute("height")).toBe("60");
  });

  it("positions a circle table at its own centre with radius half the shape default width", () => {
    const tables: DraftTable[] = [
      makeTable({ localId: "circ-1", shape: "circle", x: 660, y: 220 }),
    ];

    const { container } = render(<TemplatePreview tables={tables} />);
    const circle = container.querySelector("circle") as SVGCircleElement;

    expect(circle.getAttribute("cx")).toBe("660");
    expect(circle.getAttribute("cy")).toBe("220");
    expect(circle.getAttribute("r")).toBe("35");
  });

  it("renders only the ground rect and no shape nodes for an empty tables array", () => {
    const { container } = render(<TemplatePreview tables={[]} />);

    expect(container.querySelectorAll("rect").length).toBe(1);
    expect(container.querySelectorAll("circle").length).toBe(0);
  });

  it("marks the root svg aria-hidden with the canonical viewBox, and exposes no accessible name", () => {
    const { container } = render(<TemplatePreview tables={[]} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("viewBox", "0 0 800 600");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("applies the caller's className to the root svg", () => {
    const { container } = render(<TemplatePreview tables={[]} className="picker-card-preview" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveClass("picker-card-preview");
  });
});
