import { memo, useRef, useEffect, useState } from "react";
import { Group } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table } from "@mbe/types";
import { SHAPE_DEFAULTS, fittedSeatSize, seatPlacements } from "./floor-plan-geometry.js";
import { SeatArt, TableArt } from "./FurnitureArt.js";
import { useMotionPreset } from "@mattbutlerengineering/rialto/providers";
import { FURNITURE_PALETTE } from "./furniture-tokens.js";
import { useSectionLabelTheme } from "./section-label-theme.js";
import { TableLabel } from "./TableLabel.js";
import { TABLE_STATUS_COLOR_TOKEN, type TableDisplayStatus } from "./table-status.js";
import { glyphKeyFor } from "./table-status-glyph.js";

/* Canvas (Konva) doesn't support CSS custom properties — `fillStyle` needs a
 * literal color string, and `var(--rialto-*)` never resolves on a canvas.
 * Resolve tokens at render time from the live document instead of mirroring
 * a single palette: `getComputedStyle` picks up whichever theme is active,
 * and re-resolves whenever `data-theme` flips (see the MutationObserver in
 * TableShape below). See apps/hospitality/CLAUDE.md for the documented
 * exception this implements. */
type ColorKey = TableDisplayStatus | "inactive" | "selectedStroke";

/** rialto custom-property names backing each canvas fill/stroke. The
 * per-status keys are read from TABLE_STATUS_COLOR_TOKEN — table-status.ts's
 * source of truth — instead of being restated here. */
const COLOR_TOKENS: Record<ColorKey, string> = {
  available: TABLE_STATUS_COLOR_TOKEN.available.replace(/^var\(|\)$/g, ""),
  "reserved-soon": TABLE_STATUS_COLOR_TOKEN["reserved-soon"].replace(/^var\(|\)$/g, ""),
  seated: TABLE_STATUS_COLOR_TOKEN.seated.replace(/^var\(|\)$/g, ""),
  "needs-bussing": TABLE_STATUS_COLOR_TOKEN["needs-bussing"].replace(/^var\(|\)$/g, ""),
  inactive: "--rialto-surface-deep",
  selectedStroke: "--rialto-accent",
};

/** Fallback fills used only when a custom property hasn't resolved yet (e.g.
 * before the stylesheet paints) or `getComputedStyle` returns "" in a
 * non-browser environment. Mirrors packages/rialto/src/tokens/colors.css —
 * TableShape.test.tsx's drift-guard tests read that file directly and fail
 * if these values fall out of sync. */
const FALLBACK_COLORS: Record<"light" | "dark", Record<ColorKey, string>> = {
  light: {
    available: "#5e6a2e",
    "reserved-soon": "#b0841e",
    seated: "#b84a3c",
    "needs-bussing": "#8a6820",
    inactive: "#a8a49d",
    selectedStroke: "#b0841e",
  },
  dark: {
    available: "#9aaa4c",
    "reserved-soon": "#d4a23a",
    seated: "#e06050",
    "needs-bussing": "#d4a030",
    inactive: "#4a4643",
    selectedStroke: "#d4a23a",
  },
};

function resolveThemeColors(): Record<ColorKey, string> {
  const theme: "light" | "dark" =
    document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const fallback = FALLBACK_COLORS[theme];
  const computed = getComputedStyle(document.documentElement);
  const colors = {} as Record<ColorKey, string>;
  for (const key of Object.keys(COLOR_TOKENS) as ColorKey[]) {
    const value = computed.getPropertyValue(COLOR_TOKENS[key]).trim();
    colors[key] = value || fallback[key];
  }
  return colors;
}

export interface TableShapeProps {
  table: Table;
  isSelected: boolean;
  isDragging: boolean;
  onSelect: (tableId: string) => void;
  onDragStart: (tableId: string) => void;
  onDragEnd: (tableId: string, x: number, y: number) => void;
  /**
   * Live status derived from reservation/hold data (see `table-status.ts`).
   * Omitted in editor-only usage (no SSE status data available), which
   * falls back to "available" — matching the pre-live-status default.
   */
  status?: TableDisplayStatus;
  /** The stage's scale; sizes the label so it stays readable when the plan is shrunk. */
  stageScale?: number;
}

function TableShapeComponent({
  table,
  isSelected,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
  status,
  stageScale = 1,
}: TableShapeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const labelTheme = useSectionLabelTheme();
  const [themeColors, setThemeColors] = useState(resolveThemeColors);

  // Re-resolve fills whenever the active theme flips — Konva can't consume
  // var(--rialto-*) directly, so this is what keeps table fills in sync
  // with light/dark mode without a page reload.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeColors(resolveThemeColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Get position from shapeMetadata or default
  const x = table.shapeMetadata?.x ?? 100;
  const y = table.shapeMetadata?.y ?? 100;
  const shape = table.shapeMetadata?.shape ?? "rectangle";
  const rotation = table.shapeMetadata?.rotation ?? 0;

  // Determine the surface color. Precedence: inactive > non-available live
  // status > per-table `shapeMetadata.color` tint > available default.
  // Decision (#7264): "available" is the neutral resting state and carries no
  // operational information, so a custom tint outranks it; any other status
  // (seated, needs-bussing, reserved-soon) outranks the tint so a custom color
  // can never hide an operational state.
  const liveStatusColor = status && status !== "available" ? themeColors[status] : undefined;
  const fillColor = !table.isActive
    ? themeColors.inactive
    : liveStatusColor || table.shapeMetadata?.color || themeColors.available;

  const handleDragStart = () => {
    onDragStart(table.id);
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target;
    onDragEnd(table.id, node.x(), node.y());
  };

  const handleClick = () => {
    onSelect(table.id);
  };

  // Apply shadow when dragging. The only animated shadow on the canvas; it
  // lands instantly under reduced motion (the preset's duration is 0).
  const { precision } = useMotionPreset();
  const dragShadowDuration = precision.duration;
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.to({
        shadowBlur: isDragging ? 10 : 0,
        shadowOpacity: isDragging ? 0.3 : 0,
        duration: dragShadowDuration,
      });
    }
  }, [isDragging, dragShadowDuration]);

  // Seats are drawn first so the table surface overlaps them — the look of
  // chairs tucked under a table rather than floating beside it.
  const width = table.shapeMetadata?.width ?? SHAPE_DEFAULTS[shape].width;
  const height = table.shapeMetadata?.height ?? SHAPE_DEFAULTS[shape].height;
  const seats = seatPlacements({ shape, capacity: table.capacity, width, height });
  const chair = fittedSeatSize({ shape, capacity: table.capacity, width, height });

  return (
    <Group
      ref={groupRef}
      name="table-group"
      x={x}
      y={y}
      rotation={rotation}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onTap={handleClick}
    >
      {seats.map((seat) => (
        // Seats have no identity of their own; their placement is deterministic
        // and distinct, so the position is the stable key.
        <SeatArt
          key={`${seat.x},${seat.y}`}
          x={seat.x}
          y={seat.y}
          rotation={seat.rotation}
          width={chair.width}
          height={chair.height}
        />
      ))}
      <TableArt
        shape={shape}
        width={width}
        height={height}
        fill={fillColor}
        stroke={isSelected ? themeColors.selectedStroke : FURNITURE_PALETTE.edge}
        strokeWidth={isSelected ? 3 : 1}
      />
      <TableLabel
        number={table.tableNumber || table.name}
        covers={`${table.minCovers}-${table.maxCovers ?? table.capacity}`}
        shape={shape}
        capacity={table.capacity}
        tableWidth={width}
        tableHeight={height}
        tableRotation={rotation}
        stageScale={stageScale}
        theme={labelTheme}
        glyph={glyphKeyFor(status, table.isActive)}
      />
    </Group>
  );
}

// Memoized so an SSE status delta for one table does not re-render every table on the canvas.
export const TableShape = memo(TableShapeComponent);
