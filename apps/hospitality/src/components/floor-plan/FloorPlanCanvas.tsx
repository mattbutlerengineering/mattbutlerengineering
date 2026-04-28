import { useState, useRef, useEffect, useCallback } from "react";
import { Stage, Layer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table, FloorPlan } from "@mbe/types";
import { TableShape } from "./TableShape";
import styles from "./FloorPlanCanvas.module.css";

export interface FloorPlanCanvasProps {
  floorPlan: FloorPlan;
  tables: Table[];
  onTableMove: (tableId: string, x: number, y: number) => void;
  onTableSelect: (tableId: string | null) => void;
  selectedTableId: string | null;
  readOnly?: boolean;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const GRID_SIZE = 20;

export function FloorPlanCanvas({
  floorPlan,
  tables,
  onTableMove,
  onTableSelect,
  selectedTableId,
  readOnly = false,
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  // Resize canvas to fit container
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        const aspectRatio = CANVAS_HEIGHT / CANVAS_WIDTH;
        setDimensions({
          width: width,
          height: width * aspectRatio,
        });
        setScale(width / CANVAS_WIDTH);
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const handleDragStart = useCallback(
    (tableId: string) => {
      if (readOnly) return;
      setDraggingTableId(tableId);
    },
    [readOnly]
  );

  const handleDragEnd = useCallback(
    (tableId: string, x: number, y: number) => {
      if (readOnly) return;
      setDraggingTableId(null);

      // Snap to grid
      const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
      const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;

      onTableMove(tableId, snappedX, snappedY);
    },
    [readOnly, onTableMove]
  );

  const handleSelect = useCallback(
    (tableId: string) => {
      onTableSelect(selectedTableId === tableId ? null : tableId);
    },
    [selectedTableId, onTableSelect]
  );

  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Deselect when clicking empty area
      if (e.target === e.target.getStage()) {
        onTableSelect(null);
      }
    },
    [onTableSelect]
  );

  // Draw grid pattern
  const gridPatternUrl = `data:image/svg+xml,${encodeURIComponent(`
    <svg width="${GRID_SIZE}" height="${GRID_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${GRID_SIZE}" height="${GRID_SIZE}" fill="#f8f6f3"/>
      <path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="#d8d4cd" stroke-width="1"/>
    </svg>
  `)}`;

  return (
    <div
      ref={containerRef}
      className={styles.canvasWrapper}
      style={{
        backgroundImage: `url("${gridPatternUrl}")`,
        backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
      }}
    >
      {/* Floor plan name overlay */}
      <div className={styles.nameOverlay}>
        {floorPlan.name}
        {floorPlan.isActive && <span className={styles.activeLabel}>(Active)</span>}
      </div>

      {/* Zoom indicator */}
      <div className={styles.zoomOverlay}>{Math.round(scale * 100)}%</div>

      <Stage
        width={dimensions.width}
        height={dimensions.height}
        scaleX={scale}
        scaleY={scale}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer>
          {tables.map((table) => (
            <TableShape
              key={table.id}
              table={table}
              isSelected={table.id === selectedTableId}
              isDragging={table.id === draggingTableId}
              onSelect={handleSelect}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))}
        </Layer>
      </Stage>

      {/* Empty state */}
      {tables.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateContent}>
            <p className={styles.emptyStateTitle}>No tables on this floor plan</p>
            <p className={styles.emptyStateNote}>Add tables from the sidebar</p>
          </div>
        </div>
      )}
    </div>
  );
}
