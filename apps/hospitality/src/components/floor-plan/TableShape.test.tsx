import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { Table } from "@mbe/types";

/* ── Mock react-konva ─────────────────────────────────────────── */
// Konva runs in a canvas context — replace all primitives with DOM equivalents.
// The Group mock uses forwardRef and attaches a fake Konva node to the ref
// so that groupRef.current.to() does not throw.

vi.mock("react-konva", () => {
  const GroupMock = React.forwardRef(function GroupMock(
    {
      children,
      x,
      y,
      rotation,
      draggable: _draggable,
      onDragStart,
      onDragEnd: _onDragEnd,
      onClick,
      onTap: _onTap,
    }: {
      children?: React.ReactNode;
      x?: number;
      y?: number;
      rotation?: number;
      draggable?: boolean;
      onDragStart?: () => void;
      onDragEnd?: (e: unknown) => void;
      onClick?: () => void;
      onTap?: () => void;
    },
    ref: React.Ref<unknown>
  ) {
    // Attach a fake Konva node with a no-op .to() method
    React.useEffect(() => {
      if (ref && typeof ref === "object" && "current" in ref) {
        (ref as React.MutableRefObject<unknown>).current = { to: vi.fn() };
      }
    });

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div
        data-testid="konva-group"
        data-x={x}
        data-y={y}
        data-rotation={rotation}
        onClick={onClick}
        onMouseDown={onDragStart}
      >
        {children}
      </div>
    );
  });

  return {
    Group: GroupMock,
    Rect: ({
      fill,
      stroke,
      strokeWidth,
      width,
      height,
      // strip Konva-only props so React does not warn
      offsetX: _offsetX,
      offsetY: _offsetY,
      cornerRadius: _cornerRadius,
    }: {
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      width?: number;
      height?: number;
      offsetX?: number;
      offsetY?: number;
      cornerRadius?: number;
    }) => (
      <div
        data-testid="konva-rect"
        data-fill={fill}
        data-stroke={stroke}
        data-stroke-width={strokeWidth}
        data-width={width}
        data-height={height}
      />
    ),
    Circle: ({
      fill,
      stroke,
      strokeWidth,
      radius,
    }: {
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      radius?: number;
    }) => (
      <div
        data-testid="konva-circle"
        data-fill={fill}
        data-stroke={stroke}
        data-stroke-width={strokeWidth}
        data-radius={radius}
      />
    ),
    Text: ({
      text,
      fontSize,
      fill,
      // strip Konva-only props
      fontStyle: _fontStyle,
      align: _align,
      verticalAlign: _verticalAlign,
      offsetX: _offsetX,
      offsetY: _offsetY,
      width: _width,
      opacity: _opacity,
    }: {
      text?: string;
      fontSize?: number;
      fill?: string;
      fontStyle?: string;
      align?: string;
      verticalAlign?: string;
      offsetX?: number;
      offsetY?: number;
      width?: number;
      opacity?: number;
    }) => (
      <span data-testid="konva-text" data-text={text} data-font-size={fontSize} data-fill={fill} />
    ),
  };
});

import { TableShape } from "./TableShape.js";

/* ── Fixtures ─────────────────────────────────────────────────── */

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    id: "table-1",
    name: "Table 1",
    tableNumber: "T1",
    capacity: 4,
    minCovers: 1,
    maxCovers: 4,
    location: null,
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: "fp-1",
    shapeMetadata: {
      x: 100,
      y: 200,
      width: 80,
      height: 60,
      shape: "rectangle",
    },
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

const defaultProps = {
  isSelected: false,
  isDragging: false,
  onSelect: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
};

/* ── Tests ────────────────────────────────────────────────────── */

describe("TableShape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("shape rendering", () => {
    it("renders a Group at the correct position", () => {
      const table = makeTable({
        shapeMetadata: { x: 150, y: 250, width: 80, height: 60, shape: "rectangle" },
      });
      const { getByTestId } = render(<TableShape table={table} {...defaultProps} />);

      const group = getByTestId("konva-group");
      expect(group.getAttribute("data-x")).toBe("150");
      expect(group.getAttribute("data-y")).toBe("250");
    });

    it("renders a Rect for rect shape by default", () => {
      const table = makeTable();
      const { getByTestId } = render(<TableShape table={table} {...defaultProps} />);
      expect(getByTestId("konva-rect")).toBeDefined();
    });

    it("renders a Circle for circle shape", () => {
      const table = makeTable({
        shapeMetadata: { x: 100, y: 100, width: 70, height: 70, shape: "circle" },
      });
      const { getByTestId } = render(<TableShape table={table} {...defaultProps} />);
      expect(getByTestId("konva-circle")).toBeDefined();
    });

    it("renders a Rect for square shape", () => {
      const table = makeTable({
        shapeMetadata: { x: 100, y: 100, width: 60, height: 60, shape: "square" },
      });
      const { getAllByTestId } = render(<TableShape table={table} {...defaultProps} />);
      // square also renders as Rect
      const rects = getAllByTestId("konva-rect");
      expect(rects.length).toBeGreaterThan(0);
    });

    it("falls back to rect shape when shapeMetadata is null", () => {
      const table = makeTable({ shapeMetadata: null });
      const { getByTestId } = render(<TableShape table={table} {...defaultProps} />);
      expect(getByTestId("konva-rect")).toBeDefined();
    });

    it("applies default position (100, 100) when shapeMetadata is null", () => {
      const table = makeTable({ shapeMetadata: null });
      const { getByTestId } = render(<TableShape table={table} {...defaultProps} />);
      const group = getByTestId("konva-group");
      expect(group.getAttribute("data-x")).toBe("100");
      expect(group.getAttribute("data-y")).toBe("100");
    });

    it("applies rotation from shapeMetadata", () => {
      const table = makeTable({
        shapeMetadata: { x: 100, y: 100, width: 80, height: 60, shape: "rectangle", rotation: 45 },
      });
      const { getByTestId } = render(<TableShape table={table} {...defaultProps} />);
      expect(getByTestId("konva-group").getAttribute("data-rotation")).toBe("45");
    });
  });

  describe("status display", () => {
    it("renders table number as label text", () => {
      const table = makeTable({ tableNumber: "T7", name: "Table 7" });
      const { getAllByTestId } = render(<TableShape table={table} {...defaultProps} />);
      const texts = getAllByTestId("konva-text");
      const labelText = texts.find((el) => el.getAttribute("data-text") === "T7");
      expect(labelText).toBeDefined();
    });

    it("falls back to name when tableNumber is null", () => {
      const table = makeTable({ tableNumber: null, name: "VIP Booth" });
      const { getAllByTestId } = render(<TableShape table={table} {...defaultProps} />);
      const texts = getAllByTestId("konva-text");
      const labelText = texts.find((el) => el.getAttribute("data-text") === "VIP Booth");
      expect(labelText).toBeDefined();
    });

    it("renders capacity range text", () => {
      const table = makeTable({ minCovers: 2, maxCovers: 6, capacity: 6 });
      const { getAllByTestId } = render(<TableShape table={table} {...defaultProps} />);
      const texts = getAllByTestId("konva-text");
      const capacityText = texts.find((el) => el.getAttribute("data-text") === "2-6");
      expect(capacityText).toBeDefined();
    });

    it("uses capacity when maxCovers is null", () => {
      const table = makeTable({ minCovers: 1, maxCovers: null, capacity: 4 });
      const { getAllByTestId } = render(<TableShape table={table} {...defaultProps} />);
      const texts = getAllByTestId("konva-text");
      const capacityText = texts.find((el) => el.getAttribute("data-text") === "1-4");
      expect(capacityText).toBeDefined();
    });

    it("uses inactive color when table is not active", () => {
      const table = makeTable({ isActive: false });
      const { getByTestId } = render(<TableShape table={table} {...defaultProps} />);
      const rect = getByTestId("konva-rect");
      // inactive color is #a8a49d
      expect(rect.getAttribute("data-fill")).toBe("#a8a49d");
    });

    it("uses available color when table is active", () => {
      const table = makeTable({ isActive: true });
      const { getByTestId } = render(<TableShape table={table} {...defaultProps} />);
      const rect = getByTestId("konva-rect");
      // available color is #5e6a2e
      expect(rect.getAttribute("data-fill")).toBe("#5e6a2e");
    });
  });

  describe("selection state", () => {
    it("applies thicker stroke when selected", () => {
      const table = makeTable();
      const { getByTestId } = render(
        <TableShape table={table} {...defaultProps} isSelected={true} />
      );
      const rect = getByTestId("konva-rect");
      expect(rect.getAttribute("data-stroke-width")).toBe("3");
    });

    it("applies thin stroke when not selected", () => {
      const table = makeTable();
      const { getByTestId } = render(
        <TableShape table={table} {...defaultProps} isSelected={false} />
      );
      const rect = getByTestId("konva-rect");
      expect(rect.getAttribute("data-stroke-width")).toBe("1");
    });

    it("calls onSelect with table id when clicked", () => {
      const onSelect = vi.fn();
      const table = makeTable({ id: "table-abc" });
      const { getByTestId } = render(
        <TableShape table={table} {...defaultProps} onSelect={onSelect} />
      );
      getByTestId("konva-group").click();
      expect(onSelect).toHaveBeenCalledWith("table-abc");
    });
  });

  describe("drag state", () => {
    it("calls onDragStart with table id when drag starts", () => {
      const onDragStart = vi.fn();
      const table = makeTable({ id: "table-xyz" });
      const { getByTestId } = render(
        <TableShape table={table} {...defaultProps} onDragStart={onDragStart} />
      );
      // Trigger mousedown which we mapped to onDragStart
      const group = getByTestId("konva-group");
      group.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onDragStart).toHaveBeenCalledWith("table-xyz");
    });
  });
});
