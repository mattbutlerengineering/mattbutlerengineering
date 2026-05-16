/* eslint-disable @typescript-eslint/no-explicit-any, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock react-konva before importing component
vi.mock("react-konva", () => ({
  Stage: ({ children, width, height }: any) => (
    // Do NOT forward onClick — real Konva Stage only fires onClick on background clicks,
    // not when children are clicked. Forwarding it causes bubbled child clicks to invoke
    // handleStageClick which calls e.target.getStage() on a plain DOM element.
    <div data-testid="konva-stage" data-width={width} data-height={height}>
      {children}
    </div>
  ),
  Layer: ({ children }: any) => <div data-testid="konva-layer">{children}</div>,
}));

// Mock TableShape so we don't need to deal with nested Konva
vi.mock("./TableShape.js", () => ({
  TableShape: ({ table, isSelected, onSelect }: any) => (
    <div
      data-testid={`table-shape-${table.id}`}
      data-selected={isSelected}
      onClick={() => onSelect(table.id)}
    >
      {table.tableNumber || table.name}
    </div>
  ),
}));

vi.mock("./FloorPlanCanvas.module.css", () => ({
  default: {
    canvasWrapper: "canvasWrapper",
    nameOverlay: "nameOverlay",
    activeLabel: "activeLabel",
    zoomOverlay: "zoomOverlay",
    emptyState: "emptyState",
    emptyStateContent: "emptyStateContent",
    emptyStateTitle: "emptyStateTitle",
    emptyStateNote: "emptyStateNote",
  },
}));

import { FloorPlanCanvas } from "./FloorPlanCanvas.js";
import type { FloorPlan, Table } from "@mbe/types";

const makeFloorPlan = (overrides: Partial<FloorPlan> = {}): FloorPlan => ({
  id: "fp-1",
  venueId: "venue-1",
  name: "Main Dining",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  tables: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeTable = (id: string, overrides: Partial<Table> = {}): Table => ({
  id,
  name: `Table ${id}`,
  tableNumber: `T${id}`,
  capacity: 4,
  minCovers: 1,
  maxCovers: 4,
  location: null,
  isActive: true,
  priority: 1,
  status: "AVAILABLE",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  shapeMetadata: { x: 100, y: 100, width: 80, height: 60, shape: "rectangle" },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("FloorPlanCanvas", () => {
  const defaultProps = {
    floorPlan: makeFloorPlan(),
    tables: [makeTable("1"), makeTable("2")],
    onTableMove: vi.fn(),
    onTableSelect: vi.fn(),
    selectedTableId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the canvas wrapper", () => {
    const { container } = render(<FloorPlanCanvas {...defaultProps} />);
    expect(container.firstChild).toBeDefined();
  });

  it("shows the floor plan name overlay", () => {
    render(<FloorPlanCanvas {...defaultProps} />);
    expect(screen.getByText("Main Dining")).toBeDefined();
  });

  it("shows (Active) label when floor plan is active", () => {
    render(<FloorPlanCanvas {...defaultProps} />);
    expect(screen.getByText("(Active)")).toBeDefined();
  });

  it("does not show (Active) label when floor plan is not active", () => {
    const floorPlan = makeFloorPlan({ isActive: false });
    render(<FloorPlanCanvas {...defaultProps} floorPlan={floorPlan} />);
    expect(screen.queryByText("(Active)")).toBeNull();
  });

  it("shows zoom indicator", () => {
    render(<FloorPlanCanvas {...defaultProps} />);
    // zoom starts at 100% but getBoundingClientRect returns 0 in jsdom
    // so scale = 0/800 = 0, displayed as 0%
    const zoomEl = screen.getByText(/\d+%/);
    expect(zoomEl).toBeDefined();
  });

  it("renders a TableShape for each table", () => {
    render(<FloorPlanCanvas {...defaultProps} />);
    expect(screen.getByTestId("table-shape-1")).toBeDefined();
    expect(screen.getByTestId("table-shape-2")).toBeDefined();
  });

  it("passes isSelected=true to the selected table", () => {
    render(<FloorPlanCanvas {...defaultProps} selectedTableId="1" />);
    const selectedShape = screen.getByTestId("table-shape-1");
    expect(selectedShape.getAttribute("data-selected")).toBe("true");
  });

  it("passes isSelected=false to non-selected tables", () => {
    render(<FloorPlanCanvas {...defaultProps} selectedTableId="1" />);
    const otherShape = screen.getByTestId("table-shape-2");
    expect(otherShape.getAttribute("data-selected")).toBe("false");
  });

  it("calls onTableSelect when a table shape is clicked", () => {
    const onTableSelect = vi.fn();
    render(<FloorPlanCanvas {...defaultProps} onTableSelect={onTableSelect} />);
    screen.getByTestId("table-shape-1").click();
    // TableShape mock calls onSelect(table.id), FloorPlanCanvas toggles selection
    // When selectedTableId is null and we click table-1, it selects it
    expect(onTableSelect).toHaveBeenCalledWith("1");
  });

  it("deselects table when clicking already-selected table", () => {
    const onTableSelect = vi.fn();
    render(<FloorPlanCanvas {...defaultProps} onTableSelect={onTableSelect} selectedTableId="1" />);
    // clicking same table toggles to null
    screen.getByTestId("table-shape-1").click();
    expect(onTableSelect).toHaveBeenCalledWith(null);
  });

  it("shows empty state when no tables", () => {
    render(<FloorPlanCanvas {...defaultProps} tables={[]} />);
    expect(screen.getByText("No tables on this floor plan")).toBeDefined();
    expect(screen.getByText("Add tables from the sidebar")).toBeDefined();
  });

  it("does not show empty state when tables exist", () => {
    render(<FloorPlanCanvas {...defaultProps} />);
    expect(screen.queryByText("No tables on this floor plan")).toBeNull();
  });

  it("renders Konva Stage", () => {
    render(<FloorPlanCanvas {...defaultProps} />);
    expect(screen.getByTestId("konva-stage")).toBeDefined();
  });

  it("renders Konva Layer", () => {
    render(<FloorPlanCanvas {...defaultProps} />);
    expect(screen.getByTestId("konva-layer")).toBeDefined();
  });
});
