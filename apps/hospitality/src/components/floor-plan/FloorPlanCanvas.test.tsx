import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FloorPlan, Table } from "@mbe/types";

/* ── Mock react-konva ─────────────────────────────────────────── */

const mockOnClick = vi.fn();

vi.mock("react-konva", () => ({
  Stage: ({
    children,
    width,
    height,
    scaleX,
    scaleY,
    onClick,
    onTap,
  }: {
    children?: React.ReactNode;
    width?: number;
    height?: number;
    scaleX?: number;
    scaleY?: number;
    onClick?: (e: unknown) => void;
    onTap?: (e: unknown) => void;
  }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-testid="konva-stage"
      data-width={width}
      data-height={height}
      data-scale-x={scaleX}
      data-scale-y={scaleY}
      onClick={(e) => {
        mockOnClick(e);
        // Simulate stage click by calling the passed onClick handler
        // with a mock event that makes e.target === e.target.getStage()
        const fakeStage = { getStage: () => fakeStage };
        onClick?.({ target: fakeStage, currentTarget: null });
        onTap?.({ target: fakeStage, currentTarget: null });
      }}
    >
      {children}
    </div>
  ),
  Layer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="konva-layer">{children}</div>
  ),
}));

/* ── Mock TableShape ──────────────────────────────────────────── */

vi.mock("./TableShape.js", () => ({
  TableShape: ({
    table,
    isSelected,
    isDragging,
    onSelect,
    onDragStart,
    onDragEnd,
  }: {
    table: Table;
    isSelected: boolean;
    isDragging: boolean;
    onSelect: (id: string) => void;
    onDragStart: (id: string) => void;
    onDragEnd: (id: string, x: number, y: number) => void;
  }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      data-testid={`table-shape-${table.id}`}
      data-selected={isSelected}
      data-dragging={isDragging}
      onClick={() => onSelect(table.id)}
      onMouseDown={() => onDragStart(table.id)}
      onMouseUp={() => onDragEnd(table.id, 120, 240)}
    >
      {table.name}
    </div>
  ),
}));

import { FloorPlanCanvas } from "./FloorPlanCanvas.js";

/* ── Fixtures ─────────────────────────────────────────────────── */

const FLOOR_PLAN: FloorPlan = {
  id: "fp-1",
  venueId: "venue-1",
  name: "Main Dining",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  tables: [],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

function makeTable(id: string, name: string, overrides: Partial<Table> = {}): Table {
  return {
    id,
    name,
    tableNumber: id.toUpperCase(),
    capacity: 4,
    minCovers: 1,
    maxCovers: 4,
    location: null,
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: "fp-1",
    shapeMetadata: { x: 100, y: 100, width: 80, height: 60, shape: "rect" },
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

const TABLE_A = makeTable("t1", "Table 1");
const TABLE_B = makeTable("t2", "Table 2");

const defaultProps = {
  floorPlan: FLOOR_PLAN,
  tables: [TABLE_A, TABLE_B],
  onTableMove: vi.fn(),
  onTableSelect: vi.fn(),
  selectedTableId: null as string | null,
  readOnly: false,
};

/* ── Tests ────────────────────────────────────────────────────── */

describe("FloorPlanCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getBoundingClientRect so container resize logic works
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("render", () => {
    it("renders the floor plan name overlay", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.getByText("Main Dining")).toBeDefined();
    });

    it("shows (Active) label when floor plan is active", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.getByText("(Active)")).toBeDefined();
    });

    it("does not show (Active) label when floor plan is not active", () => {
      const inactivePlan = { ...FLOOR_PLAN, isActive: false };
      render(<FloorPlanCanvas {...defaultProps} floorPlan={inactivePlan} />);
      expect(screen.queryByText("(Active)")).toBeNull();
    });

    it("renders the Konva Stage and Layer", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.getByTestId("konva-stage")).toBeDefined();
      expect(screen.getByTestId("konva-layer")).toBeDefined();
    });

    it("renders a TableShape for each table", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.getByTestId("table-shape-t1")).toBeDefined();
      expect(screen.getByTestId("table-shape-t2")).toBeDefined();
    });

    it("shows empty state when no tables exist", () => {
      render(<FloorPlanCanvas {...defaultProps} tables={[]} />);
      expect(screen.getByText("No tables on this floor plan")).toBeDefined();
    });

    it("does not show empty state when tables exist", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      expect(screen.queryByText("No tables on this floor plan")).toBeNull();
    });

    it("renders the zoom percentage indicator", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      // Scale = 800 / 800 = 1.0 → 100%
      expect(screen.getByText("100%")).toBeDefined();
    });
  });

  describe("click handling", () => {
    it("marks the correct table as selected", () => {
      render(<FloorPlanCanvas {...defaultProps} selectedTableId="t1" />);
      const shape = screen.getByTestId("table-shape-t1");
      expect(shape.getAttribute("data-selected")).toBe("true");
    });

    it("marks non-selected tables as not selected", () => {
      render(<FloorPlanCanvas {...defaultProps} selectedTableId="t1" />);
      const shape = screen.getByTestId("table-shape-t2");
      expect(shape.getAttribute("data-selected")).toBe("false");
    });

    it("calls onTableSelect when a table shape is clicked", () => {
      const onTableSelect = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} onTableSelect={onTableSelect} />);
      fireEvent.click(screen.getByTestId("table-shape-t1"));
      expect(onTableSelect).toHaveBeenCalledWith("t1");
    });

    it("calls onTableSelect(null) when clicking empty stage area", () => {
      const onTableSelect = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} onTableSelect={onTableSelect} />);
      // Click the stage directly (our mock simulates an empty stage click)
      fireEvent.click(screen.getByTestId("konva-stage"));
      expect(onTableSelect).toHaveBeenCalledWith(null);
    });

    it("calls onTableSelect to toggle off when clicking already-selected table", () => {
      const onTableSelect = vi.fn();
      render(
        <FloorPlanCanvas {...defaultProps} selectedTableId="t1" onTableSelect={onTableSelect} />
      );
      fireEvent.click(screen.getByTestId("table-shape-t1"));
      // handleSelect toggles: if tableId === selectedTableId → null
      expect(onTableSelect).toHaveBeenCalledWith(null);
    });
  });

  describe("drag state", () => {
    it("calls onTableMove when a table drag ends", () => {
      const onTableMove = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} onTableMove={onTableMove} />);
      // mousedown = dragStart, mouseup = dragEnd
      fireEvent.mouseDown(screen.getByTestId("table-shape-t1"));
      fireEvent.mouseUp(screen.getByTestId("table-shape-t1"));
      expect(onTableMove).toHaveBeenCalledWith("t1", expect.any(Number), expect.any(Number));
    });

    it("marks table as dragging when drag starts", () => {
      render(<FloorPlanCanvas {...defaultProps} />);
      // Drag start tracked by component state; shape gets isDragging=true
      fireEvent.mouseDown(screen.getByTestId("table-shape-t1"));
      const shape = screen.getByTestId("table-shape-t1");
      expect(shape.getAttribute("data-dragging")).toBe("true");
    });

    it("does not call onTableMove when readOnly", () => {
      const onTableMove = vi.fn();
      render(<FloorPlanCanvas {...defaultProps} readOnly={true} onTableMove={onTableMove} />);
      fireEvent.mouseDown(screen.getByTestId("table-shape-t1"));
      fireEvent.mouseUp(screen.getByTestId("table-shape-t1"));
      // readOnly guard in handleDragStart prevents dragging state
      expect(onTableMove).not.toHaveBeenCalled();
    });
  });

  describe("zoom level", () => {
    it("adjusts zoom level based on container width", () => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      render(<FloorPlanCanvas {...defaultProps} />);
      // scale = 400/800 = 0.5 → 50%
      expect(screen.getByText("50%")).toBeDefined();
    });

    it("updates zoom when window resizes", () => {
      const { rerender } = render(<FloorPlanCanvas {...defaultProps} />);
      // First render at 800 → 100%
      expect(screen.getByText("100%")).toBeDefined();

      // Simulate resize to half width
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      fireEvent(window, new Event("resize"));
      rerender(<FloorPlanCanvas {...defaultProps} />);
      // After resize 400/800 = 0.5 → 50%
      expect(screen.getByText("50%")).toBeDefined();
    });
  });
});
