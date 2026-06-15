import { useRef, useEffect } from "react";
import { Group, Rect, Circle, Text } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table } from "@mbe/types";
import { SHAPE_DEFAULTS } from "./floor-plan-geometry.js";

/* Canvas (Konva) doesn't support CSS custom properties — use JS constants */
const TABLE_LABEL_COLOR = "#ffffff";

export interface TableShapeProps {
  table: Table;
  isSelected: boolean;
  isDragging: boolean;
  onSelect: (tableId: string) => void;
  onDragStart: (tableId: string) => void;
  onDragEnd: (tableId: string, x: number, y: number) => void;
}

const TABLE_COLORS = {
  available: "#5e6a2e", // Rialto Success
  occupied: "#b84a3c", // Rialto Error
  reserved: "#8a6820", // Rialto Warning
  inactive: "#a8a49d", // Rialto Surface Deep
};

export function TableShape({
  table,
  isSelected,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
}: TableShapeProps) {
  const groupRef = useRef<Konva.Group>(null);

  // Get position from shapeMetadata or default
  const x = table.shapeMetadata?.x ?? 100;
  const y = table.shapeMetadata?.y ?? 100;
  const shape = table.shapeMetadata?.shape ?? "rectangle";
  const rotation = table.shapeMetadata?.rotation ?? 0;

  // Determine color based on table state
  const fillColor = !table.isActive ? TABLE_COLORS.inactive : TABLE_COLORS.available;

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
    const stroke = isSelected ? "#b0841e" : "#b8b4ad";

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
