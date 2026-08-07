import { useRef, useEffect, useState } from "react";
import { Group, Rect, Circle, Text } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table } from "@mbe/types";
import { SHAPE_DEFAULTS } from "./floor-plan-geometry.js";
import { TABLE_STATUS_COLOR_TOKEN } from "./table-status.js";

/* Canvas (Konva) doesn't support CSS custom properties — `fillStyle` needs a
 * literal color string, and `var(--rialto-*)` never resolves on a canvas.
 * Resolve tokens at render time from the live document instead of mirroring
 * a single palette: `getComputedStyle` picks up whichever theme is active,
 * and re-resolves whenever `data-theme` flips (see the MutationObserver in
 * TableShape below). See apps/hospitality/CLAUDE.md for the documented
 * exception this implements. */
const TABLE_LABEL_COLOR = "#ffffff";

type ColorKey = "available" | "inactive" | "selectedStroke";

/** rialto custom-property names backing each canvas fill/stroke. "available"
 * is read from TABLE_STATUS_COLOR_TOKEN — table-status.ts's source of truth
 * — instead of being restated here. */
const COLOR_TOKENS: Record<ColorKey, string> = {
  available: TABLE_STATUS_COLOR_TOKEN.available.replace(/^var\(|\)$/g, ""),
  inactive: "--rialto-surface-deep",
  selectedStroke: "--rialto-accent",
};

/** Fallback fills used only when a custom property hasn't resolved yet (e.g.
 * before the stylesheet paints) or `getComputedStyle` returns "" in a
 * non-browser environment. Mirrors packages/rialto/src/tokens/colors.css —
 * TableShape.test.tsx's drift-guard tests read that file directly and fail
 * if these values fall out of sync. */
const FALLBACK_COLORS: Record<"light" | "dark", Record<ColorKey, string>> = {
  light: { available: "#5e6a2e", inactive: "#a8a49d", selectedStroke: "#b0841e" },
  dark: { available: "#9aaa4c", inactive: "#4a4643", selectedStroke: "#d4a23a" },
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
}

export function TableShape({
  table,
  isSelected,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
}: TableShapeProps) {
  const groupRef = useRef<Konva.Group>(null);
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

  // Determine color based on table state
  const fillColor = !table.isActive ? themeColors.inactive : themeColors.available;

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

  // Apply shadow when dragging
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.to({
        shadowBlur: isDragging ? 10 : 0,
        shadowOpacity: isDragging ? 0.3 : 0,
        duration: 0.1,
      });
    }
  }, [isDragging]);

  const renderShape = () => {
    const strokeWidth = isSelected ? 3 : 1;
    const stroke = isSelected ? themeColors.selectedStroke : "#b8b4ad";

    switch (shape) {
      case "circle":
        return (
          <Circle
            radius={SHAPE_DEFAULTS.circle.width / 2}
            fill={fillColor}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
      case "square":
        return (
          <Rect
            width={SHAPE_DEFAULTS.square.width}
            height={SHAPE_DEFAULTS.square.height}
            offsetX={SHAPE_DEFAULTS.square.width / 2}
            offsetY={SHAPE_DEFAULTS.square.height / 2}
            fill={fillColor}
            stroke={stroke}
            strokeWidth={strokeWidth}
            cornerRadius={4}
          />
        );
      case "rectangle":
      default:
        return (
          <Rect
            width={SHAPE_DEFAULTS.rectangle.width}
            height={SHAPE_DEFAULTS.rectangle.height}
            offsetX={SHAPE_DEFAULTS.rectangle.width / 2}
            offsetY={SHAPE_DEFAULTS.rectangle.height / 2}
            fill={fillColor}
            stroke={stroke}
            strokeWidth={strokeWidth}
            cornerRadius={4}
          />
        );
    }
  };

  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      rotation={rotation}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onTap={handleClick}
    >
      {renderShape()}
      <Text
        text={table.tableNumber || table.name}
        fontSize={14}
        fontStyle="bold"
        fill={TABLE_LABEL_COLOR}
        align="center"
        verticalAlign="middle"
        offsetX={20}
        offsetY={7}
        width={40}
      />
      <Text
        text={`${table.minCovers}-${table.maxCovers ?? table.capacity}`}
        fontSize={10}
        fill={TABLE_LABEL_COLOR}
        align="center"
        offsetX={15}
        offsetY={-8}
        width={30}
        opacity={0.8}
      />
    </Group>
  );
}
