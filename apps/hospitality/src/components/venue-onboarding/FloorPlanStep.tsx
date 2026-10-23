import { useCallback, useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Text, Button, ConfirmDialog } from "@mattbutlerengineering/rialto";
import type { CreateTableRequest } from "@mbe/types";
import { FloorPlanCanvas, AddTableDialog } from "../floor-plan/index.js";
import { TemplateMiniPreview } from "../floor-plan/TemplateMiniPreview.js";
import { TemplatePicker, type TemplateSelection } from "../floor-plan/TemplatePicker.js";
import type { RoomSizeId } from "../floor-plan/room-templates.js";
import {
  DRAFT_ID,
  DUPLICATE_TABLE_NAME_MESSAGE,
  draftToCanvasFloorPlan,
  draftToCanvasTables,
  findDuplicateName,
  type FloorPlanDraft,
} from "./floor-plan-draft.js";
import { draftFromTemplate, layoutForDraft, type TemplateId } from "./floor-plan-templates.js";

import styles from "./FloorPlanStep.module.css";

export interface FloorPlanStepProps {
  draft: FloorPlanDraft;
  /** errors.floorPlan from the wizard reducer. */
  error: string | null;
  onSelectTemplate: (templateId: TemplateId) => void;
  onSelectSize: (sizeId: RoomSizeId) => void;
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

export function FloorPlanStep({
  draft,
  error,
  onSelectTemplate,
  onSelectSize,
  onAddTable,
  onMoveTable,
  onRemoveTable,
  readOnly = false,
}: FloorPlanStepProps): JSX.Element {
  const { t } = useTranslation();
  const isWideViewport = useIsWideViewport();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<TemplateSelection | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const applySelection = useCallback(
    ({ templateId, sizeId }: TemplateSelection) => {
      if (sizeId !== draft.sizeId) onSelectSize(sizeId);
      if (templateId !== draft.templateId) onSelectTemplate(templateId);
      setAnnouncement(
        t("floorPlan.templates.applied", {
          name: t(`floorPlan.templates.items.${templateId}.name`),
          size: t(`floorPlan.templates.sizes.${sizeId}.name`),
          tables: t("onboarding.floorPlan.tableCount", {
            count: draftFromTemplate(templateId, sizeId).tables.length,
          }),
        })
      );
    },
    [draft.sizeId, draft.templateId, onSelectSize, onSelectTemplate, t]
  );

  const handlePickerChange = useCallback(
    (selection: TemplateSelection) => {
      if (readOnly) return;
      if (draft.pristine) {
        applySelection(selection);
      } else {
        setPendingSelection(selection);
      }
    },
    [readOnly, draft.pristine, applySelection]
  );

  const handleConfirmReplace = useCallback(() => {
    if (!pendingSelection) return;
    applySelection(pendingSelection);
    setPendingSelection(null);
  }, [pendingSelection, applySelection]);

  const handleCanvasTableMove = useCallback(
    (tableId: string, x: number, y: number) => {
      // Pointer drag — snapped by FloorPlanCanvas itself. No announcement:
      // a drag is its own feedback. Keyboard nudges also arrive here but
      // are announced by FloorPlanCanvas via onAnnounce.
      onMoveTable(tableId, x, y);
    },
    [onMoveTable]
  );

  const handleAddTableSubmit = useCallback(
    async (request: CreateTableRequest) => {
      if (findDuplicateName(draft.tables, request.name)) {
        throw new Error(DUPLICATE_TABLE_NAME_MESSAGE);
      }
      onAddTable(request);
      setAddDialogOpen(false);
      setAnnouncement(t("onboarding.floorPlan.tableAdded", { name: request.name }));
    },
    [draft.tables, onAddTable, t]
  );

  const selectedTable = draft.tables.find((t) => t.localId === selectedTableId) ?? null;

  const handleRemoveSelected = useCallback(() => {
    if (!selectedTable) return;
    onRemoveTable(selectedTable.localId);
    setAnnouncement(t("onboarding.floorPlan.tableRemoved", { name: selectedTable.name }));
  }, [selectedTable, onRemoveTable, t]);

  // Render-time derivations: the zones the canvas draws (the draft's own
  // section rows carry name and colour) and the layout the narrow-viewport
  // band previews. Both recomputed, never stored — nothing to sync in an effect.
  const sectionZones = draft.sections.map((zone) => ({
    id: zone.id,
    name: zone.name,
    color: zone.color,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
  }));
  // The draft's own tables, not a rebuild of its template — this branch exposes
  // no editing, but it must not disagree with the wide one or with the review
  // card at step 6, all three of which read the same projection.
  const narrowPreviewLayout = layoutForDraft(draft);

  return (
    <div className={styles.stepContainer}>
      <Text variant="label">{t("onboarding.floorPlan.heading")}</Text>
      <Text variant="body" color="secondary">
        {t("onboarding.floorPlan.intro")}
      </Text>

      {readOnly && (
        <div className={styles.lockedBanner}>
          <Text variant="body" color="secondary">
            {t("onboarding.floorPlan.locked")}
          </Text>
        </div>
      )}

      <TemplatePicker
        templateId={draft.templateId}
        sizeId={draft.sizeId}
        onChange={handlePickerChange}
        disabled={readOnly}
      />

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
              {t("onboarding.floorPlan.addTable")}
            </Button>
          )}

          {draft.templateId === null ? (
            <div className={styles.emptyState}>
              <Text variant="label">{t("onboarding.floorPlan.emptyHeading")}</Text>
              <Text variant="body" color="secondary">
                {t("onboarding.floorPlan.emptyBody")}
              </Text>
            </div>
          ) : draft.tables.length === 0 ? (
            <div className={styles.emptyState}>
              <Text variant="label">{t("onboarding.floorPlan.emptyFloorHeading")}</Text>
              <Text variant="body" color="secondary">
                {t("onboarding.floorPlan.emptyFloorBody")}
              </Text>
            </div>
          ) : (
            <FloorPlanCanvas
              floorPlan={draftToCanvasFloorPlan(draft)}
              tables={draftToCanvasTables(draft)}
              sections={sectionZones}
              walls={draft.walls}
              onTableMove={handleCanvasTableMove}
              onTableSelect={setSelectedTableId}
              selectedTableId={selectedTableId}
              readOnly={readOnly}
              onAnnounce={setAnnouncement}
            />
          )}

          <div className={styles.selectionBar}>
            {selectedTable ? (
              <>
                <Text>
                  {t("onboarding.floorPlan.selected", {
                    name: selectedTable.name,
                    seats: t("onboarding.floorPlan.seatCount", { count: selectedTable.capacity }),
                    shape: t(`onboarding.floorPlan.shapes.${selectedTable.shape}`),
                  })}
                </Text>
                {!readOnly && (
                  <Button variant="secondary" onClick={handleRemoveSelected}>
                    {t("onboarding.floorPlan.removeTable")}
                  </Button>
                )}
              </>
            ) : (
              <Text variant="caption" color="tertiary">
                {readOnly
                  ? t("onboarding.floorPlan.selectHintReadOnly")
                  : t("onboarding.floorPlan.selectHint")}
              </Text>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.previewBand}>
          {narrowPreviewLayout && (
            <TemplateMiniPreview layout={narrowPreviewLayout} className={styles.previewSvg} />
          )}
          <Text variant="body" color="secondary">
            {t("onboarding.floorPlan.narrowViewport")}
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
        open={pendingSelection !== null}
        title={t("onboarding.floorPlan.replaceTitle")}
        description={
          pendingSelection
            ? t("onboarding.floorPlan.replaceDescription", {
                name: t(`floorPlan.templates.items.${pendingSelection.templateId}.name`),
              })
            : undefined
        }
        confirmLabel={t("onboarding.floorPlan.replaceConfirm")}
        cancelLabel={t("onboarding.floorPlan.replaceCancel")}
        variant="destructive"
        onConfirm={handleConfirmReplace}
        onCancel={() => setPendingSelection(null)}
      />

      <div role="status" aria-live="polite" aria-atomic="true" className={styles.srOnly}>
        {announcement}
      </div>
    </div>
  );
}
