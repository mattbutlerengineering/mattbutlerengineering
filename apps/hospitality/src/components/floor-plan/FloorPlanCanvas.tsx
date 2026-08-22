import { useState, useRef, useEffect, useCallback } from "react";
import { Stage, Layer } from "react-konva";
import { Text } from "@mattbutlerengineering/rialto";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table, FloorPlan } from "@mbe/types";
import { TableShape } from "./TableShape";
import { TableSelectionOverlay } from "./TableSelectionOverlay.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE, snapToGrid } from "./floor-plan-geometry.js";
import type { TableDisplayStatus } from "./table-status.js";
import styles from "./FloorPlanCanvas.module.css";

// Grid pattern background — pure function of GRID_SIZE, computed once at
// module load rather than on every render (draggingTableId/dimensions/scale/
// tableStatuses all change far more often than the grid itself does).
const GRID_PATTERN_URL = `data:image/svg+xml,${encodeURIComponent(`
  <svg width="${GRID_SIZE}" height="${GRID_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${GRID_SIZE}" height="${GRID_SIZE}" fill="#f8f6f3"/>
    <path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="#d8d4cd" stroke-width="1"/>
  </svg>
`)}`;

export interface FloorPlanCanvasProps {
  floorPlan: FloorPlan;
  tables: Table[];
  onTableMove: (tableId: string, x: number, y: number) => void;
  onTableSelect: (tableId: string | null) => void;
  selectedTableId: string | null;
  readOnly?: boolean;
  /**
   * Live per-table status, keyed by table id (see `useTableStatuses`).
   * Omitted in editor-only usage — tables then render `TableShape`'s
   * own "available" default with no regression.
   */
  tableStatuses?: ReadonlyMap<string, TableDisplayStatus>;
  /**
   * True when the SSE connection is down (see `useSSEStatus().isConnected`
   * in the caller). The canvas keeps rendering the last-known
   * `tableStatuses` — nothing is cleared — but shows a staleness
   * indicator so staff know colors may be out of date. Omitted in
   * editor-only usage — no indicator renders, matching the `tableStatuses`
   * no-regression contract above.
   */
  isStale?: boolean;
}

export function FloorPlanCanvas({
  floorPlan,
  tables,
  onTableMove,
  onTableSelect,
  selectedTableId,
  readOnly = false,
  tableStatuses,
  isStale = false,
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
      onTableMove(tableId, snapToGrid(x), snapToGrid(y));
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

  return (
    <div
      ref={containerRef}
      className={styles.canvasWrapper}
      style={{
        backgroundImage: `url("${GRID_PATTERN_URL}")`,
        backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
      }}
    >
      {/* Floor plan name overlay */}
      <div className={styles.nameOverlay}>
        {floorPlan.name}
        {floorPlan.isActive && <Text className={styles.activeLabel}>(Active)</Text>}
      </div>

      {/* Zoom indicator */}
      <div className={styles.zoomOverlay}>{Math.round(scale * 100)}%</div>

      {/* Staleness indicator — connection dropped; last-known table
          statuses above are retained as-is, not cleared. */}
      {isStale && (
        <div className={styles.staleOverlay} role="status" data-testid="floor-plan-stale-indicator">
          <Text variant="label" className={styles.staleDot} />
          <Text className={styles.staleLabel}>Reconnecting — showing last known status</Text>
        </div>
      )}

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
              status={tableStatuses?.get(table.id)}
            />
          ))}
        </Layer>
      </Stage>

      {/* Keyboard-only table selection — Konva's canvas isn't natively
          focusable, so this DOM overlay gives Tab/Enter access to the same
          onSelect callback the pointer handlers above already use. */}
      <TableSelectionOverlay
        tables={tables}
        scale={scale}
        selectedTableId={selectedTableId}
        onSelect={handleSelect}
      />

      {/* Empty state */}
      {tables.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateContent}>
            <Text className={styles.emptyStateTitle}>No tables on this floor plan</Text>
            <Text className={styles.emptyStateNote}>Add tables from the sidebar</Text>
          </div>
        </div>
      )}
    </div>
  );
}
