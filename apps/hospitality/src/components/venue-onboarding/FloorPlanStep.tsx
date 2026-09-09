import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from "react";
import { Text, Button, ConfirmDialog } from "@mattbutlerengineering/rialto";
import type { CreateTableRequest } from "@mbe/types";
import { FloorPlanCanvas, AddTableDialog } from "../floor-plan/index.js";
import { GRID_SIZE, snapToGrid } from "../floor-plan/floor-plan-geometry.js";
import {
  DRAFT_ID,
  DUPLICATE_TABLE_NAME_MESSAGE,
  draftToCanvasFloorPlan,
  draftToCanvasTables,
  findDuplicateName,
  type DraftTable,
  type FloorPlanDraft,
} from "./floor-plan-draft.js";
import {
  FLOOR_PLAN_TEMPLATES,
  tablesForTemplate,
  templateById,
  type FloorPlanTemplate,
  type TemplateId,
} from "./floor-plan-templates.js";
import { TemplatePreview } from "./TemplatePreview.js";
import styles from "./FloorPlanStep.module.css";

export interface FloorPlanStepProps {
  draft: FloorPlanDraft;
  /** errors.floorPlan from the wizard reducer. */
  error: string | null;
  onSelectTemplate: (templateId: TemplateId) => void;
  onAddTable: (request: CreateTableRequest) => void;
  onMoveTable: (localId: string, x: number, y: number) => void;
  onRemoveTable: (localId: string) => void;
  /**
   * True once Launch has created server state (`launch.venueId !== null`).
   * The draft then freezes: `runTablesStage` resumes by table NAME, so a
   * table moved, removed, or replaced via a template swap after a partial
   * failure would be skipped on Retry and the live plan would silently
   * diverge from the draft (#4825). Mirrors the step-5 navigation floor the
   * wizard reducer already applies to Back / the step rail.
   */
  readOnly?: boolean;
}

const WIDE_VIEWPORT_QUERY = "(min-width: 1024px)";

const LOCKED_MESSAGE =
  "Your venue is already being created, so this layout is locked. Finish setting up, then rearrange tables in the floor plan editor.";

/** True at >= 1024px, where the desktop canvas is editable. Below it, M13's read-only preview band renders instead. */
function useIsWideViewport(): boolean {
  const [isWide, setIsWide] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(WIDE_VIEWPORT_QUERY).matches : true
  );

  useEffect(() => {
    const mql = window.matchMedia(WIDE_VIEWPORT_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isWide;
}

function pickerCardAriaLabel(template: FloorPlanTemplate, tables: readonly DraftTable[]): string {
  if (template.id === "blank") return "Blank — no tables";
  const seats = tables.reduce((sum, table) => sum + table.capacity, 0);
  return `${template.name} — ${tables.length} tables, ${seats} seats`;
}

function capitalizeShape(shape: DraftTable["shape"]): string {
  return shape.charAt(0).toUpperCase() + shape.slice(1);
}

export function FloorPlanStep({
  draft,
  error,
  onSelectTemplate,
  onAddTable,
  onMoveTable,
  onRemoveTable,
  readOnly = false,
}: FloorPlanStepProps): JSX.Element {
  const isWideViewport = useIsWideViewport();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<TemplateId | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const cardsRef = useRef<Map<TemplateId, HTMLButtonElement>>(new Map());

  const applyTemplate = useCallback(
    (templateId: TemplateId) => {
      onSelectTemplate(templateId);
      const template = templateById(templateId);
      setAnnouncement(
        `${template.name} layout applied — ${tablesForTemplate(template).length} tables`
      );
    },
    [onSelectTemplate]
  );

  const handleSelectTemplate = useCallback(
    (templateId: TemplateId) => {
      if (readOnly) return;
      if (draft.pristine) {
        applyTemplate(templateId);
      } else {
        setPendingTemplateId(templateId);
      }
    },
    [readOnly, draft.pristine, applyTemplate]
  );

  const handleConfirmReplace = useCallback(() => {
    if (!pendingTemplateId) return;
    applyTemplate(pendingTemplateId);
    setPendingTemplateId(null);
  }, [pendingTemplateId, applyTemplate]);

  const handlePickerKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (readOnly) return;
      const currentId = draft.templateId ?? FLOOR_PLAN_TEMPLATES[0]!.id;
      const currentIndex = FLOOR_PLAN_TEMPLATES.findIndex((t) => t.id === currentId);
      let nextIndex: number | null = null;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % FLOOR_PLAN_TEMPLATES.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + FLOOR_PLAN_TEMPLATES.length) % FLOOR_PLAN_TEMPLATES.length;
      } else if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = FLOOR_PLAN_TEMPLATES.length - 1;
      }

      if (nextIndex === null) return;
      e.preventDefault();
      const next = FLOOR_PLAN_TEMPLATES[nextIndex]!;
      cardsRef.current.get(next.id)?.focus();
      handleSelectTemplate(next.id);
    },
    [readOnly, draft.templateId, handleSelectTemplate]
  );

  const handleCanvasTableMove = useCallback(
    (tableId: string, x: number, y: number) => {
      // Pointer drag — snapped by FloorPlanCanvas itself. No announcement:
      // a drag is its own feedback (see the keyboard-nudge effect below).
      onMoveTable(tableId, x, y);
    },
    [onMoveTable]
  );

  // Keyboard-only table move. FloorPlanCanvas has no keyboard move of its
  // own (TableSelectionOverlay only makes selection keyboard-reachable —
  // see its docstring), so this mirrors FloorPlanEditorPage's arrow-key
  // handler and is the one path that fires the "moved to" announcement.
  useEffect(() => {
    if (readOnly || !isWideViewport || !selectedTableId || addDialogOpen) return;

    const handler = (e: globalThis.KeyboardEvent) => {
      // The template picker's own onKeyDown (handlePickerKeyDown) already
      // calls preventDefault() when it consumes an arrow key to move
      // radiogroup focus — bail here so this window-level listener never
      // ALSO nudges the selected canvas table for the same keypress.
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;

      const table = draft.tables.find((t) => t.localId === selectedTableId);
      if (!table) return;

      e.preventDefault();
      const dx = e.key === "ArrowRight" ? GRID_SIZE : e.key === "ArrowLeft" ? -GRID_SIZE : 0;
      const dy = e.key === "ArrowDown" ? GRID_SIZE : e.key === "ArrowUp" ? -GRID_SIZE : 0;
      const x = snapToGrid(table.x + dx);
      const y = snapToGrid(table.y + dy);
      onMoveTable(selectedTableId, x, y);
      setAnnouncement(`${table.name} moved to ${x}, ${y}`);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [readOnly, isWideViewport, selectedTableId, addDialogOpen, draft.tables, onMoveTable]);

  const handleAddTableSubmit = useCallback(
    async (request: CreateTableRequest) => {
      if (findDuplicateName(draft.tables, request.name)) {
        throw new Error(DUPLICATE_TABLE_NAME_MESSAGE);
      }
      onAddTable(request);
      setAddDialogOpen(false);
      setAnnouncement(`${request.name} added`);
    },
    [draft.tables, onAddTable]
  );

  const selectedTable = draft.tables.find((t) => t.localId === selectedTableId) ?? null;

  const handleRemoveSelected = useCallback(() => {
    if (!selectedTable) return;
    onRemoveTable(selectedTable.localId);
    setAnnouncement(`${selectedTable.name} removed`);
  }, [selectedTable, onRemoveTable]);

  const pendingTemplate = pendingTemplateId ? templateById(pendingTemplateId) : null;

  return (
    <div className={styles.stepContainer}>
      <Text variant="label">Floor Plan</Text>
      <Text variant="body" color="secondary">
        Start from a layout like yours, then arrange it.
      </Text>

      {readOnly && (
        <div className={styles.lockedBanner}>
          <Text variant="body" color="secondary">
            {LOCKED_MESSAGE}
          </Text>
        </div>
      )}

      <div
        role="radiogroup"
        aria-label="Floor plan layout"
        tabIndex={-1}
        className={styles.pickerGroup}
        onKeyDown={handlePickerKeyDown}
      >
        {FLOOR_PLAN_TEMPLATES.map((template) => {
          const tables = tablesForTemplate(template);
          const isSelected = template.id === draft.templateId;
          const isRovingFocus = template.id === (draft.templateId ?? FLOOR_PLAN_TEMPLATES[0]!.id);

          return (
            <Button
              key={template.id}
              ref={(ref) => {
                if (ref) cardsRef.current.set(template.id, ref);
              }}
              variant="ghost"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isRovingFocus ? 0 : -1}
              disabled={readOnly}
              aria-label={pickerCardAriaLabel(template, tables)}
              className={`${styles.pickerCard} ${isSelected ? styles.pickerCardSelected : ""}`}
              onClick={() => handleSelectTemplate(template.id)}
            >
              <TemplatePreview tables={tables} className={styles.pickerPreview} />
              <Text variant="label">{template.name}</Text>
              <Text variant="caption" color="secondary">
                {template.zoneLine}
              </Text>
              <Text variant="caption" color="secondary">
                {template.summary}
              </Text>
            </Button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className={styles.errorBanner}>
          <Text variant="body" color="error">
            {error}
          </Text>
        </div>
      )}

      {isWideViewport ? (
        <div className={styles.canvasArea}>
          {!readOnly && (
            <Button variant="primary" onClick={() => setAddDialogOpen(true)}>
              Add table
            </Button>
          )}

          {draft.templateId === null ? (
            <div className={styles.emptyState}>
              <Text variant="label">Your floor plan appears here</Text>
              <Text variant="body" color="secondary">
                Pick a layout above to start arranging tables.
              </Text>
            </div>
          ) : draft.tables.length === 0 ? (
            <div className={styles.emptyState}>
              <Text variant="label">An empty floor</Text>
              <Text variant="body" color="secondary">
                Add tables with the button above, or pick a layout to start from one.
              </Text>
            </div>
          ) : (
            <FloorPlanCanvas
              floorPlan={draftToCanvasFloorPlan(draft)}
              tables={draftToCanvasTables(draft)}
              onTableMove={handleCanvasTableMove}
              onTableSelect={setSelectedTableId}
              selectedTableId={selectedTableId}
              readOnly={readOnly}
            />
          )}

          <div className={styles.selectionBar}>
            {selectedTable ? (
              <>
                <Text>
                  {selectedTable.name} · {selectedTable.capacity} seats ·{" "}
                  {capitalizeShape(selectedTable.shape)}
                </Text>
                {!readOnly && (
                  <Button variant="secondary" onClick={handleRemoveSelected}>
                    Remove table
                  </Button>
                )}
              </>
            ) : (
              <Text variant="caption" color="tertiary">
                {readOnly
                  ? "Select a table to see its details."
                  : "Select a table to move or remove it."}
              </Text>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.previewBand}>
          <TemplatePreview tables={draft.tables} className={styles.previewSvg} />
          <Text variant="body" color="secondary">
            Arranging tables needs a wider screen. Your layout is saved — open it on a desktop to
            move things around.
          </Text>
        </div>
      )}

      {isWideViewport && addDialogOpen && (
        <AddTableDialog
          venueId={DRAFT_ID}
          floorPlanId={DRAFT_ID}
          onSubmit={handleAddTableSubmit}
          onClose={() => setAddDialogOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingTemplate !== null}
        title="Replace your layout?"
        description={
          pendingTemplate
            ? `You've changed this floor plan. Choosing ${pendingTemplate.name} replaces your tables with the ${pendingTemplate.name} layout.`
            : undefined
        }
        confirmLabel="Replace layout"
        cancelLabel="Keep mine"
        variant="destructive"
        onConfirm={handleConfirmReplace}
        onCancel={() => setPendingTemplateId(null)}
      />

      <div role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly}>
        {announcement}
      </div>
    </div>
  );
}
