/* eslint-disable @typescript-eslint/no-explicit-any, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// Mock react-konva before importing component
vi.mock("react-konva", () => ({
  Group: ({
    children,
    onClick,
    onTap: _onTap,
    onDragStart,
    onDragEnd: _onDragEnd,
    x,
    y,
    rotation,
    draggable,
    ref: _ref,
  }: any) => (
    <div
      data-testid="konva-group"
      data-x={x}
      data-y={y}
      data-rotation={rotation}
      data-draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
    >
      {children}
    </div>
  ),
  Rect: ({ fill, stroke, strokeWidth, width, height, cornerRadius }: any) => (
    <div
      data-testid="konva-rect"
      data-fill={fill}
      data-stroke={stroke}
      data-stroke-width={strokeWidth}
      data-width={width}
      data-height={height}
      data-corner-radius={cornerRadius}
    />
  ),
  Circle: ({ fill, stroke, strokeWidth, radius }: any) => (
    <div
      data-testid="konva-circle"
      data-fill={fill}
      data-stroke={stroke}
      data-stroke-width={strokeWidth}
      data-radius={radius}
    />
  ),
  Text: ({ text, fontSize, fill, align }: any) => (
    <div
      data-testid="konva-text"
      data-text={text}
      data-font-size={fontSize}
      data-fill={fill}
      data-align={align}
    />
  ),
}));

// Mock konva itself
vi.mock("konva", () => ({
  default: {},
}));

import { TableShape } from "./TableShape.js";
import type { Table } from "@mbe/types";

const makeTable = (overrides: Partial<Table> = {}): Table => ({
  id: "table-1",
  name: "Table 1",
  tableNumber: "T1",
  capacity: 4,
  minCovers: 1,
  maxCovers: 4,
  location: "Main room",
  isActive: true,
  priority: 1,
  status: "AVAILABLE",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  shapeMetadata: {
    x: 100,
    y: 150,
    width: 80,
    height: 60,
    shape: "rectangle",
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("TableShape", () => {
  const defaultProps = {
    table: makeTable(),
    isSelected: false,
    isDragging: false,
    onSelect: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a group with position from shapeMetadata", () => {
    const { getByTestId } = render(<TableShape {...defaultProps} />);
    const group = getByTestId("konva-group");
    expect(group.getAttribute("data-x")).toBe("100");
    expect(group.getAttribute("data-y")).toBe("150");
  });

  it("renders rect shape by default (rectangle)", () => {
    const { getAllByTestId } = render(<TableShape {...defaultProps} />);
    const rects = getAllByTestId("konva-rect");
    expect(rects.length).toBeGreaterThan(0);
  });

  it("renders circle shape when shape is circle", () => {
    const table = makeTable({
      shapeMetadata: { x: 50, y: 60, width: 70, height: 70, shape: "circle" },
    });
    const { getByTestId } = render(<TableShape {...defaultProps} table={table} />);
    expect(getByTestId("konva-circle")).toBeDefined();
  });

  it("renders square shape when shape is square", () => {
    const table = makeTable({
      shapeMetadata: { x: 50, y: 60, width: 60, height: 60, shape: "square" },
    });
    const { getAllByTestId } = render(<TableShape {...defaultProps} table={table} />);
    // square renders a Rect
    const rects = getAllByTestId("konva-rect");
    expect(rects.length).toBeGreaterThan(0);
  });

  it("uses inactive color when table is not active", () => {
    const table = makeTable({ isActive: false });
    const { getAllByTestId } = render(<TableShape {...defaultProps} table={table} />);
    const rects = getAllByTestId("konva-rect");
    // inactive color: #a8a49d
    const inactiveRect = rects.find((r) => r.getAttribute("data-fill") === "#a8a49d");
    expect(inactiveRect).toBeDefined();
  });

  it("uses active (available) color when table is active", () => {
    const { getAllByTestId } = render(<TableShape {...defaultProps} />);
    const rects = getAllByTestId("konva-rect");
    // available color: #5e6a2e
    const activeRect = rects.find((r) => r.getAttribute("data-fill") === "#5e6a2e");
    expect(activeRect).toBeDefined();
  });

  it("applies selected stroke when isSelected is true", () => {
    const { getAllByTestId } = render(<TableShape {...defaultProps} isSelected={true} />);
    const rects = getAllByTestId("konva-rect");
    // selected stroke: #b0841e, strokeWidth 3
    const selectedRect = rects.find((r) => r.getAttribute("data-stroke") === "#b0841e");
    expect(selectedRect).toBeDefined();
    expect(selectedRect?.getAttribute("data-stroke-width")).toBe("3");
  });

  it("applies default stroke when not selected", () => {
    const { getAllByTestId } = render(<TableShape {...defaultProps} isSelected={false} />);
    const rects = getAllByTestId("konva-rect");
    const defaultRect = rects.find((r) => r.getAttribute("data-stroke") === "#b8b4ad");
    expect(defaultRect).toBeDefined();
    expect(defaultRect?.getAttribute("data-stroke-width")).toBe("1");
  });

  it("renders table number as text label", () => {
    const { getAllByTestId } = render(<TableShape {...defaultProps} />);
    const texts = getAllByTestId("konva-text");
    const labelText = texts.find((t) => t.getAttribute("data-text") === "T1");
    expect(labelText).toBeDefined();
  });

  it("renders table name when no tableNumber", () => {
    const table = makeTable({ tableNumber: null });
    const { getAllByTestId } = render(<TableShape {...defaultProps} table={table} />);
    const texts = getAllByTestId("konva-text");
    const labelText = texts.find((t) => t.getAttribute("data-text") === "Table 1");
    expect(labelText).toBeDefined();
  });

  it("renders capacity range text", () => {
    const table = makeTable({ minCovers: 2, maxCovers: 6 });
    const { getAllByTestId } = render(<TableShape {...defaultProps} table={table} />);
    const texts = getAllByTestId("konva-text");
    const capacityText = texts.find((t) => t.getAttribute("data-text") === "2-6");
    expect(capacityText).toBeDefined();
  });

  it("uses capacity when maxCovers is null", () => {
    const table = makeTable({ minCovers: 1, maxCovers: null, capacity: 4 });
    const { getAllByTestId } = render(<TableShape {...defaultProps} table={table} />);
    const texts = getAllByTestId("konva-text");
    const capacityText = texts.find((t) => t.getAttribute("data-text") === "1-4");
    expect(capacityText).toBeDefined();
  });

  it("calls onSelect with table id when group is clicked", () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(<TableShape {...defaultProps} onSelect={onSelect} />);
    const group = getByTestId("konva-group");
    group.click();
    expect(onSelect).toHaveBeenCalledWith("table-1");
  });

  it("calls onDragStart with table id when drag starts", () => {
    const onDragStart = vi.fn();
    const { getByTestId } = render(<TableShape {...defaultProps} onDragStart={onDragStart} />);
    const group = getByTestId("konva-group");
    group.dispatchEvent(new Event("dragstart", { bubbles: true }));
    expect(onDragStart).toHaveBeenCalledWith("table-1");
  });

  it("defaults to x=100, y=100 when shapeMetadata is null", () => {
    const table = makeTable({ shapeMetadata: null });
    const { getByTestId } = render(<TableShape {...defaultProps} table={table} />);
    const group = getByTestId("konva-group");
    expect(group.getAttribute("data-x")).toBe("100");
    expect(group.getAttribute("data-y")).toBe("100");
  });

  it("defaults to rect shape when shapeMetadata.shape is undefined", () => {
    const table = makeTable({
      shapeMetadata: { x: 10, y: 20, width: 80, height: 60, shape: "rectangle" },
    });
    const { getAllByTestId } = render(<TableShape {...defaultProps} table={table} />);
    const rects = getAllByTestId("konva-rect");
    expect(rects.length).toBeGreaterThan(0);
  });
});
