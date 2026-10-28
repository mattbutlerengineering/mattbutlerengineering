import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { Table } from "@mbe/types";
import { SHAPE_DEFAULTS } from "./floor-plan-geometry.js";
import type { TableDisplayStatus } from "./table-status.js";
import { STATUS_LABEL_KEY, glyphKeyFor, type StatusGlyphKey } from "./table-status-glyph.js";
import styles from "./TableSelectionOverlay.module.css";

export interface TableSelectionOverlayProps {
  tables: Table[];
  scale: number;
  selectedTableId: string | null;
  onSelect: (tableId: string) => void;
  /**
   * Live status per table. When supplied, each button's name carries the status
   * ("Table 4, Needs bussing"), so the canvas glyph is the only place it is drawn
   * and nothing is announced twice. Omitted in editor-only usage.
   */
  tableStatuses?: ReadonlyMap<string, TableDisplayStatus>;
}

function tableAriaLabel(t: TFunction, label: string, status: StatusGlyphKey | null): string {
  return status === null
    ? t("floorPlan.canvas.tableAria", { label })
    : t("floorPlan.canvas.tableAriaWithStatus", { label, status: t(STATUS_LABEL_KEY[status]) });
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
  tableStatuses,
}: TableSelectionOverlayProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.overlay}>
      {tables.map((table) => {
        const x = table.shapeMetadata?.x ?? 100;
        const y = table.shapeMetadata?.y ?? 100;
        const shape = table.shapeMetadata?.shape ?? "rectangle";
        const width = table.shapeMetadata?.width ?? SHAPE_DEFAULTS[shape].width;
        const height = table.shapeMetadata?.height ?? SHAPE_DEFAULTS[shape].height;
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
            aria-label={tableAriaLabel(
              t,
              table.tableNumber || table.name,
              // A table the feed has not reported (before the first snapshot) has no
              // known status: say nothing rather than a guess.
              glyphKeyFor(tableStatuses?.get(table.id), table.isActive)
            )}
            onClick={() => onSelect(table.id)}
          />
        );
      })}
    </div>
  );
}
