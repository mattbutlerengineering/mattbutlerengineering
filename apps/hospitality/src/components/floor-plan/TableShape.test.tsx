import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Table } from "@mbe/types";

/* ── Rialto color-token drift guard ──────────────────────────────
 * Reads the real, drift-checked design-token source instead of
 * mirroring hex values in this test file — if TableShape.tsx's
 * fallback colors ever fall out of sync with the tokens below, the
 * "drift guard" tests at the bottom of this file fail.
 *
 * Resolved from `process.cwd()` (vitest runs from apps/hospitality)
 * rather than `import.meta.url` — Vite statically rewrites
 * `new URL(literal, import.meta.url)` into an asset-URL transform that
 * breaks once the path escapes this package's directory.
 */
const RIALTO_COLORS_CSS_PATH = resolve(
  process.cwd(),
  "../../packages/rialto/src/tokens/colors.css"
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractToken(cssText: string, blockSelector: string, tokenName: string): string {
  const blockPattern = new RegExp(`${escapeRegExp(blockSelector)}\\s*\\{([^}]*)\\}`);
  const block = cssText.match(blockPattern)?.[1] ?? "";
  const value = block.match(new RegExp(`${escapeRegExp(tokenName)}:\\s*([^;]+);`))?.[1];
  if (!value) {
    throw new Error(`Token ${tokenName} not found in block ${blockSelector}`);
  }
  return value.trim();
}

function readRialtoToken(tokenName: string, theme: "light" | "dark"): string {
  const cssText = readFileSync(RIALTO_COLORS_CSS_PATH, "utf-8");
  const blockSelector = theme === "light" ? ":root" : '[data-theme="dark"]';
  return extractToken(cssText, blockSelector, tokenName);
}

/* ── Mock react-konva ─────────────────────────────────────────── */
// Konva runs in a canvas context — replace all primitives with DOM equivalents.
// Each mock surfaces only the props these tests assert on (so unrecognised
// Konva-only props never reach the DOM and warn), including Konva's `name`,
// which is how TableShape tags the table surface and each seat.
// The Group mock uses forwardRef and attaches a fake Konva node to the ref
// so that groupRef.current.to() does not throw.

vi.mock("react-konva", () => {
  interface ShapeMockProps {
    name?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    width?: number;
    height?: number;
    radius?: number;
    cornerRadius?: number;
    opacity?: number;
  }

  function shapeMock(kind: string) {
    return function ShapeMock({
      name,
      fill,
      stroke,
      strokeWidth,
      width,
      height,
      radius,
      cornerRadius,
      opacity,
    }: ShapeMockProps) {
      return (
        <div
          data-testid={`konva-${kind}`}
          data-name={name}
          data-fill={fill}
          data-stroke={stroke}
          data-stroke-width={strokeWidth}
          data-width={width}
          data-height={height}
          data-radius={radius}
          data-corner-radius={cornerRadius}
          data-opacity={opacity}
        />
      );
    };
  }

  const GroupMock = React.forwardRef(function GroupMock(
    {
      children,
      name,
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
      name?: string;
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
        data-name={name}
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
    Rect: shapeMock("rect"),
    Circle: shapeMock("circle"),
    Line: shapeMock("line"),
    Path: shapeMock("path"),
    Text: ({
      text,
      fontSize,
      fill,
    }: {
      text?: string;
      fontSize?: number;
      fill?: string;
      [key: string]: unknown;
    }) => (
      <span data-testid="konva-text" data-text={text} data-font-size={fontSize} data-fill={fill} />
    ),
  };
});

import { TableShape } from "./TableShape.js";
import { TABLE_CORNER_RADIUS, SEAT_NAME, TABLE_SURFACE_NAME } from "./furniture-tokens.js";

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

/* ── Queries ──────────────────────────────────────────────────────
 * The shape now renders furniture art — many primitives per table — so
 * every assertion targets a node by its Konva `name` rather than by
 * primitive kind. */

function queryNamed(name: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-name="${name}"]`));
}

function requireNamed(name: string): HTMLElement {
  const [node] = queryNamed(name);
  if (!node) throw new Error(`No rendered node named "${name}"`);
  return node;
}

/** The table's own surface — the node carrying the status/selection colors. */
const tableSurface = () => requireNamed(TABLE_SURFACE_NAME);
/** The draggable root group for the table. */
const tableGroup = () => requireNamed("table-group");
const seatNodes = () => queryNamed(SEAT_NAME);

/** Sets a CSS custom property on <html>, simulating the rialto stylesheet. */
function setThemeVar(name: string, value: string): void {
  document.documentElement.style.setProperty(name, value);
}

function setTheme(theme: "light" | "dark"): void {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function resetDocumentTheme(): void {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
}

/* ── Tests ────────────────────────────────────────────────────── */

describe("TableShape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDocumentTheme();
  });

  afterEach(() => {
    resetDocumentTheme();
  });

  describe("shape rendering", () => {
    it("renders a Group at the correct position", () => {
      const table = makeTable({
        shapeMetadata: { x: 150, y: 250, width: 80, height: 60, shape: "rectangle" },
      });
      render(<TableShape table={table} {...defaultProps} />);

      const group = tableGroup();
      expect(group.getAttribute("data-x")).toBe("150");
      expect(group.getAttribute("data-y")).toBe("250");
    });

    it("renders a rounded rect surface for rect shape by default", () => {
      render(<TableShape table={makeTable()} {...defaultProps} />);
      const surface = tableSurface();
      expect(surface.getAttribute("data-testid")).toBe("konva-rect");
      expect(surface.getAttribute("data-corner-radius")).toBe(
        String(TABLE_CORNER_RADIUS.rectangle)
      );
    });

    it("renders a circular surface for circle shape", () => {
      const table = makeTable({
        shapeMetadata: { x: 100, y: 100, width: 70, height: 70, shape: "circle" },
      });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableSurface().getAttribute("data-testid")).toBe("konva-circle");
    });

    it("renders a tighter-cornered surface for square shape", () => {
      const table = makeTable({
        shapeMetadata: { x: 100, y: 100, width: 60, height: 60, shape: "square" },
      });
      render(<TableShape table={table} {...defaultProps} />);
      const surface = tableSurface();
      expect(surface.getAttribute("data-testid")).toBe("konva-rect");
      expect(surface.getAttribute("data-corner-radius")).toBe(String(TABLE_CORNER_RADIUS.square));
    });

    it("falls back to rect shape when shapeMetadata is null", () => {
      const table = makeTable({ shapeMetadata: null });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableSurface().getAttribute("data-corner-radius")).toBe(
        String(TABLE_CORNER_RADIUS.rectangle)
      );
    });

    it("applies default position (100, 100) when shapeMetadata is null", () => {
      const table = makeTable({ shapeMetadata: null });
      render(<TableShape table={table} {...defaultProps} />);
      const group = tableGroup();
      expect(group.getAttribute("data-x")).toBe("100");
      expect(group.getAttribute("data-y")).toBe("100");
    });

    it("applies rotation from shapeMetadata", () => {
      const table = makeTable({
        shapeMetadata: { x: 100, y: 100, width: 80, height: 60, shape: "rectangle", rotation: 45 },
      });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableGroup().getAttribute("data-rotation")).toBe("45");
    });
  });

  describe("furniture art", () => {
    it("draws wood grain over the rectangular table surface", () => {
      render(<TableShape table={makeTable()} {...defaultProps} />);
      // Grain lines and edge highlights are Konva Lines; a bare primitive had none.
      expect(document.querySelectorAll('[data-testid="konva-line"]').length).toBeGreaterThan(0);
    });

    it("draws concentric grain rings and a highlight arc on a round table", () => {
      const table = makeTable({
        shapeMetadata: { x: 100, y: 100, width: 70, height: 70, shape: "circle" },
        capacity: 0,
      });
      render(<TableShape table={table} {...defaultProps} />);
      // Round art = contact shadow + surface + 3 grain rings.
      expect(document.querySelectorAll('[data-testid="konva-circle"]').length).toBe(5);
      expect(document.querySelectorAll('[data-testid="konva-path"]').length).toBe(1);
    });

    it("draws a contact shadow beneath the surface", () => {
      render(<TableShape table={makeTable()} {...defaultProps} />);
      expect(queryNamed("table-shadow")).toHaveLength(1);
    });
  });

  describe("seats", () => {
    it.each([2, 4, 6, 8])("draws one seat per cover for a capacity of %i", (capacity) => {
      render(<TableShape table={makeTable({ capacity })} {...defaultProps} />);
      expect(seatNodes()).toHaveLength(capacity);
    });

    it("draws seats around a round table too", () => {
      const table = makeTable({
        capacity: 5,
        shapeMetadata: { x: 100, y: 100, width: 70, height: 70, shape: "circle" },
      });
      render(<TableShape table={table} {...defaultProps} />);
      expect(seatNodes()).toHaveLength(5);
    });

    it("draws no seats for a table with no capacity", () => {
      render(<TableShape table={makeTable({ capacity: 0 })} {...defaultProps} />);
      expect(seatNodes()).toHaveLength(0);
    });

    it("tucks seats under the table by drawing them before the surface", () => {
      render(<TableShape table={makeTable({ capacity: 4 })} {...defaultProps} />);
      const [firstSeat] = seatNodes();
      expect(firstSeat).toBeDefined();
      expect(firstSeat?.compareDocumentPosition(tableSurface())).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    });

    it("places each seat at its geometric placement", () => {
      const table = makeTable({
        capacity: 2,
        shapeMetadata: { x: 0, y: 0, width: 80, height: 60, shape: "rectangle" },
      });
      render(<TableShape table={table} {...defaultProps} />);
      const groups = seatNodes();
      expect(groups.map((g) => g.getAttribute("data-rotation"))).toEqual(["180", "0"]);
      expect(groups.map((g) => g.getAttribute("data-y"))).toEqual(["-37", "37"]);
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
      render(<TableShape table={table} {...defaultProps} />);
      // inactive color is #a8a49d
      expect(tableSurface().getAttribute("data-fill")).toBe("#a8a49d");
    });

    it("uses available color when table is active", () => {
      const table = makeTable({ isActive: true });
      render(<TableShape table={table} {...defaultProps} />);
      // available color is #5e6a2e
      expect(tableSurface().getAttribute("data-fill")).toBe("#5e6a2e");
    });

    it("uses the default available color when no status is provided (editor-only usage)", () => {
      const table = makeTable({ isActive: true });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableSurface().getAttribute("data-fill")).toBe("#5e6a2e");
    });

    it("renders the seated status color when status is seated", () => {
      const table = makeTable({ isActive: true });
      render(<TableShape table={table} {...defaultProps} status="seated" />);
      // seated color mirrors --rialto-error (#b84a3c)
      expect(tableSurface().getAttribute("data-fill")).toBe("#b84a3c");
    });

    it("renders the needs-bussing status color when status is needs-bussing", () => {
      const table = makeTable({ isActive: true });
      render(<TableShape table={table} {...defaultProps} status="needs-bussing" />);
      // needs-bussing color mirrors --rialto-warning (#8a6820)
      expect(tableSurface().getAttribute("data-fill")).toBe("#8a6820");
    });

    it("renders the reserved-soon status color when status is reserved-soon", () => {
      const table = makeTable({ isActive: true });
      render(<TableShape table={table} {...defaultProps} status="reserved-soon" />);
      // reserved-soon color mirrors --rialto-accent (#b0841e)
      expect(tableSurface().getAttribute("data-fill")).toBe("#b0841e");
    });

    it("renders the available status color when status is explicitly available and the table has no custom color", () => {
      const table = makeTable({ isActive: true });
      render(<TableShape table={table} {...defaultProps} status="available" />);
      expect(tableSurface().getAttribute("data-fill")).toBe("#5e6a2e");
    });

    it("keeps the inactive color even when a live status is provided", () => {
      const table = makeTable({ isActive: false });
      render(<TableShape table={table} {...defaultProps} status="seated" />);
      expect(tableSurface().getAttribute("data-fill")).toBe("#a8a49d");
    });
  });

  describe("shapeMetadata.color tint", () => {
    it("tints the table surface with shapeMetadata.color in the editor", () => {
      const table = makeTable({
        shapeMetadata: {
          x: 10,
          y: 10,
          width: 80,
          height: 60,
          shape: "rectangle",
          color: "#123456",
        },
      });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableSurface().getAttribute("data-fill")).toBe("#123456");
    });

    it("lets a live status override the tint, so status always reads", () => {
      const table = makeTable({
        shapeMetadata: {
          x: 10,
          y: 10,
          width: 80,
          height: 60,
          shape: "rectangle",
          color: "#123456",
        },
      });
      render(<TableShape table={table} {...defaultProps} status="seated" />);
      expect(tableSurface().getAttribute("data-fill")).toBe("#b84a3c");
    });

    it("lets the tint outrank the neutral available status (#7264)", () => {
      const table = makeTable({
        isActive: true,
        shapeMetadata: {
          x: 10,
          y: 10,
          width: 80,
          height: 60,
          shape: "rectangle",
          color: "#123456",
        },
      });
      render(<TableShape table={table} {...defaultProps} status="available" />);
      expect(tableSurface().getAttribute("data-fill")).toBe("#123456");
    });

    it("lets needs-bussing override the tint", () => {
      const table = makeTable({
        shapeMetadata: {
          x: 10,
          y: 10,
          width: 80,
          height: 60,
          shape: "rectangle",
          color: "#123456",
        },
      });
      render(<TableShape table={table} {...defaultProps} status="needs-bussing" />);
      expect(tableSurface().getAttribute("data-fill")).toBe("#8a6820");
    });

    it("lets an inactive table override the tint", () => {
      const table = makeTable({
        isActive: false,
        shapeMetadata: {
          x: 10,
          y: 10,
          width: 80,
          height: 60,
          shape: "rectangle",
          color: "#123456",
        },
      });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableSurface().getAttribute("data-fill")).toBe("#a8a49d");
    });
  });

  describe("theme-aware colors", () => {
    it("resolves the active fill from the --rialto-success custom property", () => {
      setThemeVar("--rialto-success", "rgb(1, 2, 3)");
      const table = makeTable({ isActive: true });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableSurface().getAttribute("data-fill")).toBe("rgb(1, 2, 3)");
    });

    it("resolves the inactive fill from the --rialto-surface-deep custom property", () => {
      setThemeVar("--rialto-surface-deep", "rgb(4, 5, 6)");
      const table = makeTable({ isActive: false });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableSurface().getAttribute("data-fill")).toBe("rgb(4, 5, 6)");
    });

    it("resolves the selected stroke from the --rialto-accent custom property", () => {
      setThemeVar("--rialto-accent", "rgb(7, 8, 9)");
      const table = makeTable();
      render(<TableShape table={table} {...defaultProps} isSelected={true} />);
      expect(tableSurface().getAttribute("data-stroke")).toBe("rgb(7, 8, 9)");
    });

    it("updates fills when the theme changes at runtime, without a remount", async () => {
      setThemeVar("--rialto-success", "rgb(1, 1, 1)");
      const table = makeTable({ isActive: true });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableSurface().getAttribute("data-fill")).toBe("rgb(1, 1, 1)");

      setThemeVar("--rialto-success", "rgb(2, 2, 2)");
      setTheme("dark");

      await waitFor(() => {
        expect(tableSurface().getAttribute("data-fill")).toBe("rgb(2, 2, 2)");
      });
    });

    // Every live-status color key (not just "available") is resolved through
    // the same getComputedStyle/fallback mechanism — covering all four here
    // is the drift guard for issue #3893's reserved-soon/seated/needs-bussing
    // fallbacks, not just the originally-fixed "available" case.
    it.each([
      ["available", "--rialto-success"],
      ["reserved-soon", "--rialto-accent"],
      ["seated", "--rialto-error"],
      ["needs-bussing", "--rialto-warning"],
    ] as const)(
      "falls back to the light-theme hex for status %s when its token is unset",
      (status, token) => {
        const table = makeTable({ isActive: true });
        render(<TableShape table={table} {...defaultProps} status={status} />);
        expect(tableSurface().getAttribute("data-fill")).toBe(readRialtoToken(token, "light"));
      }
    );

    it.each([
      ["available", "--rialto-success"],
      ["reserved-soon", "--rialto-accent"],
      ["seated", "--rialto-error"],
      ["needs-bussing", "--rialto-warning"],
    ] as const)(
      "falls back to the dark-theme hex for status %s when its token is unset and dark theme is active",
      (status, token) => {
        setTheme("dark");
        const table = makeTable({ isActive: true });
        render(<TableShape table={table} {...defaultProps} status={status} />);
        expect(tableSurface().getAttribute("data-fill")).toBe(readRialtoToken(token, "dark"));
      }
    );

    it("falls back to the dark-theme hex for the inactive fill in dark mode", () => {
      setTheme("dark");
      const table = makeTable({ isActive: false });
      render(<TableShape table={table} {...defaultProps} />);
      expect(tableSurface().getAttribute("data-fill")).toBe(
        readRialtoToken("--rialto-surface-deep", "dark")
      );
    });

    it("falls back to the dark-theme hex for the selected stroke in dark mode", () => {
      setTheme("dark");
      const table = makeTable();
      render(<TableShape table={table} {...defaultProps} isSelected={true} />);
      expect(tableSurface().getAttribute("data-stroke")).toBe(
        readRialtoToken("--rialto-accent", "dark")
      );
    });

    it("inactive-table dark fallback is legible against the dark surface (not the light-theme grey)", () => {
      // Regression guard for the specific bug reported in #3893: the light
      // inactive fill (#a8a49d) rendered against the dark surface.
      const lightFallback = readRialtoToken("--rialto-surface-deep", "light");
      const darkFallback = readRialtoToken("--rialto-surface-deep", "dark");
      expect(darkFallback).not.toBe(lightFallback);
    });
  });

  describe("selection state", () => {
    it("applies thicker stroke when selected", () => {
      const table = makeTable();
      render(<TableShape table={table} {...defaultProps} isSelected={true} />);
      expect(tableSurface().getAttribute("data-stroke-width")).toBe("3");
    });

    it("applies thin stroke when not selected", () => {
      const table = makeTable();
      render(<TableShape table={table} {...defaultProps} isSelected={false} />);
      expect(tableSurface().getAttribute("data-stroke-width")).toBe("1");
    });

    it("calls onSelect with table id when clicked", () => {
      const onSelect = vi.fn();
      const table = makeTable({ id: "table-abc" });
      render(<TableShape table={table} {...defaultProps} onSelect={onSelect} />);
      tableGroup().click();
      expect(onSelect).toHaveBeenCalledWith("table-abc");
    });
  });

  describe("drag state", () => {
    it("calls onDragStart with table id when drag starts", () => {
      const onDragStart = vi.fn();
      const table = makeTable({ id: "table-xyz" });
      render(<TableShape table={table} {...defaultProps} onDragStart={onDragStart} />);
      // Trigger mousedown which we mapped to onDragStart
      tableGroup().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onDragStart).toHaveBeenCalledWith("table-xyz");
    });
  });
});

describe("TableShape memoization", () => {
  it("does not re-render when props are unchanged, and re-renders when status changes", () => {
    let renderCount = 0;
    const table = makeTable();
    Object.defineProperty(table, "isActive", {
      get() {
        renderCount++;
        return true;
      },
    });
    const noop = () => {};

    function Harness({ status }: { status?: "seated" }) {
      const [tick, setTick] = React.useState(0);
      return (
        <>
          <button
            data-testid="force-rerender"
            data-tick={tick}
            onClick={() => setTick((n) => n + 1)}
          />
          <TableShape
            table={table}
            isSelected={false}
            isDragging={false}
            onSelect={noop}
            onDragStart={noop}
            onDragEnd={noop}
            status={status}
          />
        </>
      );
    }

    const { rerender, getByTestId } = render(<Harness />);
    const countAfterMount = renderCount;
    expect(countAfterMount).toBeGreaterThan(0);

    fireEvent.click(getByTestId("force-rerender"));
    expect(renderCount).toBe(countAfterMount);

    rerender(<Harness status="seated" />);
    expect(renderCount).toBeGreaterThan(countAfterMount);
  });
});
