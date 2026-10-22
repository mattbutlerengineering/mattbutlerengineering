import { useState, useRef, useEffect, useCallback, useId } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Stage, Layer } from "react-konva";
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Table, FloorPlan, WallLayout } from "@mbe/types";
import { TableShape } from "./TableShape";
import { WallShape } from "./WallShape.js";
import { TableSelectionOverlay } from "./TableSelectionOverlay.js";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SIZE,
  SHAPE_DEFAULTS,
  snapToGrid,
  type Point,
  type WallEnd,
} from "./floor-plan-geometry.js";
import type { TableDisplayStatus } from "./table-status.js";
import styles from "./FloorPlanCanvas.module.css";

// Grid pattern background — pure function of GRID_SIZE, computed once at
// module load rather than on every render (draggingTableId/dimensions/scale/
// tableStatuses all change far more often than the grid itself does).
//
// Drawn as two repeating-linear-gradients using the rialto border token
// instead of a data-URI SVG with baked-in hex fill/stroke — a data URI is a
// separate resource and can't resolve `var(--rialto-*)`, which is how the
// old version painted a light-theme-only grid in dark mode. CSS custom
// properties in a plain background-image resolve live against whichever
// theme is active, and the wrapper's own `--rialto-surface-recessed`
// background (FloorPlanCanvas.module.css) shows through as the grid fill.
const GRID_LINE_COLOR = "var(--rialto-border)";
const GRID_PATTERN = [
  `repeating-linear-gradient(0deg, ${GRID_LINE_COLOR} 0, ${GRID_LINE_COLOR} 1px, transparent 1px, transparent ${GRID_SIZE}px)`,
  `repeating-linear-gradient(90deg, ${GRID_LINE_COLOR} 0, ${GRID_LINE_COLOR} 1px, transparent 1px, transparent ${GRID_SIZE}px)`,
].join(", ");

const ARROW_DELTAS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -GRID_SIZE],
  ArrowDown: [0, GRID_SIZE],
  ArrowLeft: [-GRID_SIZE, 0],
  ArrowRight: [GRID_SIZE, 0],
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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
  /**
   * Called when Delete/Backspace is pressed while focus is inside the
   * canvas with a table selected. Omitted = the canvas does not handle
   * delete. Keyboard handling is focus-scoped (not a window listener), so
   * dialogs rendered outside the canvas never trigger it.
   */
  onDeleteRequest?: (tableId: string) => void;
  /** Screen-reader message after a keyboard nudge ("Table 1 moved to 120, 100"). */
  onAnnounce?: (message: string) => void;
  /** Walls and windows to draw; omitted = none (plans saved before walls existed). */
  walls?: readonly WallLayout[];
  selectedWallId?: string | null;
  onWallSelect?: (wallId: string | null) => void;
  /** Pointer drag of a selected wall's endpoint handle; omitted = walls are not draggable. */
  onWallEndpointMove?: (wallId: string, end: WallEnd, p: Point) => void;
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
  onDeleteRequest,
  onAnnounce,
  walls = [],
  selectedWallId = null,
  onWallSelect,
  onWallEndpointMove,
}: FloorPlanCanvasProps) {
  const { t } = useTranslation();
  const instructionsId = useId();
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

  // Stable identity so WallShape's memo holds across canvas re-renders.
  const handleWallSelect = useCallback((id: string) => onWallSelect?.(id), [onWallSelect]);

  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Deselect when clicking empty area
      if (e.target === e.target.getStage()) {
        onTableSelect(null);
      }
    },
    [onTableSelect]
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      // Cheap guards first: read-only canvases and unselected state never act,
      // and a handler further down the tree that already consumed the key wins.
      if (readOnly || !selectedTableId || e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      const table = tables.find((t) => t.id === selectedTableId);
      if (!table) return;

      if ((e.key === "Delete" || e.key === "Backspace") && onDeleteRequest) {
        e.preventDefault();
        onDeleteRequest(table.id);
        return;
      }

      const delta = ARROW_DELTAS[e.key];
      if (!delta) return;
      e.preventDefault();
      const shape = table.shapeMetadata?.shape ?? "rectangle";
      const { width, height } = SHAPE_DEFAULTS[shape];
      // x/y are the table CENTRE (TableShape offsets by half its size), so keep
      // the centre within half a shape of each edge. Only the pressed axis moves.
      const curX = table.shapeMetadata?.x ?? 100;
      const curY = table.shapeMetadata?.y ?? 100;
      const x =
        delta[0] === 0
          ? curX
          : clamp(snapToGrid(curX + delta[0]), width / 2, CANVAS_WIDTH - width / 2);
      const y =
        delta[1] === 0
          ? curY
          : clamp(snapToGrid(curY + delta[1]), height / 2, CANVAS_HEIGHT - height / 2);
      onTableMove(table.id, x, y);
      onAnnounce?.(t("floorPlan.canvas.moved", { name: table.name, x, y }));
    },
    [readOnly, selectedTableId, tables, onDeleteRequest, onTableMove, onAnnounce, t]
  );

  return (
    // Focus-scoped keyboard handling. tabIndex -1 lets a pointer click on the
    // canvas move focus here (so keys work after mouse selection) without
    // adding a tab stop; Tab still reaches the per-table overlay buttons.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={containerRef}
      role="group"
      aria-label={t("floorPlan.canvas.label")}
      aria-describedby={instructionsId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      data-testid="floor-plan-canvas-wrapper"
      className={styles.canvasWrapper}
      style={{
        backgroundImage: GRID_PATTERN,
        backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
      }}
    >
      <Text id={instructionsId} className={styles.srOnly}>
        {onDeleteRequest
          ? t("floorPlan.canvas.instructionsWithDelete")
          : t("floorPlan.canvas.instructions")}
      </Text>

      {/* Floor plan name overlay */}
      <div className={styles.nameOverlay}>
        {floorPlan.name}
        {floorPlan.isActive && (
          <Text className={styles.activeLabel}>{t("floorPlan.canvas.active")}</Text>
        )}
      </div>

      {/* Zoom indicator */}
      <div className={styles.zoomOverlay}>{Math.round(scale * 100)}%</div>

      {/* Staleness indicator — connection dropped; last-known table
          statuses above are retained as-is, not cleared. */}
      {isStale && (
        <div className={styles.staleOverlay} role="status" data-testid="floor-plan-stale-indicator">
          <Text variant="label" className={styles.staleDot} />
          <Text className={styles.staleLabel}>{t("floorPlan.canvas.stale")}</Text>
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
          {walls.map((wall) => (
            <WallShape
              key={wall.id}
              wall={wall}
              isSelected={wall.id === selectedWallId}
              onSelect={handleWallSelect}
              onEndpointDrag={readOnly ? undefined : onWallEndpointMove}
            />
          ))}
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
            <Text className={styles.emptyStateTitle}>{t("floorPlan.canvas.emptyTitle")}</Text>
            <Text className={styles.emptyStateNote}>{t("floorPlan.canvas.emptyNote")}</Text>
          </div>
        </div>
      )}
    </div>
  );
}
