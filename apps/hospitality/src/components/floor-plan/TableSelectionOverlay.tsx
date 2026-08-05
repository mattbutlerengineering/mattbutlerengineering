import type { Table } from "@mbe/types";
import { SHAPE_DEFAULTS } from "./floor-plan-geometry.js";
import styles from "./TableSelectionOverlay.module.css";

export interface TableSelectionOverlayProps {
  tables: Table[];
  scale: number;
  selectedTableId: string | null;
  onSelect: (tableId: string) => void;
}

/**
 * Konva canvases are not natively keyboard-focusable, so table selection on
 * the floor plan is otherwise reachable only via mouse/touch. This renders
 * one native `<button>` per table, positioned to coincide with its rendered
 * Konva shape, purely so keyboard users can Tab to and select a table. Mouse
 * interaction still goes straight through to the canvas (see `.overlay`'s
 * `pointer-events: none` in the CSS module) so drag-and-drop is unaffected.
 *
 * Selecting via `onSelect` reuses the same callback pointer clicks use, so
 * `FloorPlanEditorPage`'s existing Arrow-key move / Delete / Escape handling
 * becomes reachable once a table is keyboard-selected.
 */
export function TableSelectionOverlay({
  tables,
  scale,
  selectedTableId,
  onSelect,
}: TableSelectionOverlayProps) {
  return (
    <div className={styles.overlay}>
      {tables.map((table) => {
        const x = table.shapeMetadata?.x ?? 100;
        const y = table.shapeMetadata?.y ?? 100;
        const shape = table.shapeMetadata?.shape ?? "rectangle";
        const { width, height } = SHAPE_DEFAULTS[shape];
        const isSelected = table.id === selectedTableId;

        return (
          /* eslint-disable-next-line mbe-local/prefer-rialto-components -- invisible, Konva-shape-coincident hit target requires a native, unstyled button element */
          <button
            key={table.id}
            type="button"
            className={styles.tableButton}
            style={{
              left: x * scale,
              top: y * scale,
              width: width * scale,
              height: height * scale,
            }}
            aria-pressed={isSelected}
            aria-label={`Table ${table.tableNumber || table.name}`}
            onClick={() => onSelect(table.id)}
          />
        );
      })}
    </div>
  );
}
