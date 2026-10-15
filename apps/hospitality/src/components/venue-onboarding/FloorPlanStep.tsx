import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Text, Button, ConfirmDialog } from "@mattbutlerengineering/rialto";
import type { CreateTableRequest } from "@mbe/types";
import { FloorPlanCanvas, AddTableDialog } from "../floor-plan/index.js";
import {
  DRAFT_ID,
  DUPLICATE_TABLE_NAME_MESSAGE,
  draftToCanvasFloorPlan,
  draftToCanvasTables,
  findDuplicateName,
  type FloorPlanDraft,
} from "./floor-plan-draft.js";
import {
  FLOOR_PLAN_TEMPLATES,
  tablesForTemplate,
  templateById,
  type TemplateId,
} from "./floor-plan-templates.js";
import { layoutCounts, layoutSummary } from "./floor-plan-copy.js";
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
  onAddTable,
  onMoveTable,
  onRemoveTable,
  readOnly = false,
}: FloorPlanStepProps): JSX.Element {
  const { t } = useTranslation();
  const isWideViewport = useIsWideViewport();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<TemplateId | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const cardsRef = useRef<Map<TemplateId, HTMLButtonElement>>(new Map());

  const applyTemplate = useCallback(
    (templateId: TemplateId) => {
      onSelectTemplate(templateId);
      setAnnouncement(
        t("onboarding.floorPlan.layoutApplied", {
          name: t(`onboarding.floorPlan.templates.${templateId}.name`),
          tables: t("onboarding.floorPlan.tableCount", {
            count: tablesForTemplate(templateById(templateId)).length,
          }),
        })
      );
    },
    [onSelectTemplate, t]
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

  const pendingTemplate = pendingTemplateId ? templateById(pendingTemplateId) : null;

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

      <div
        role="radiogroup"
        aria-label={t("onboarding.floorPlan.layoutLabel")}
        tabIndex={-1}
        className={styles.pickerGroup}
        onKeyDown={handlePickerKeyDown}
      >
        {FLOOR_PLAN_TEMPLATES.map((template) => {
          const tables = tablesForTemplate(template);
          const templateName = t(`onboarding.floorPlan.templates.${template.id}.name`);
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
              aria-label={
                template.id === "blank"
                  ? t("onboarding.floorPlan.cardLabelBlank", { name: templateName })
                  : t("onboarding.floorPlan.cardLabel", {
                      name: templateName,
                      ...layoutCounts(t, tables),
                    })
              }
              className={`${styles.pickerCard} ${isSelected ? styles.pickerCardSelected : ""}`}
              onClick={() => handleSelectTemplate(template.id)}
            >
              <TemplatePreview tables={tables} className={styles.pickerPreview} />
              <Text variant="label">{templateName}</Text>
              <Text variant="caption" color="secondary">
                {t(`onboarding.floorPlan.templates.${template.id}.zoneLine`)}
              </Text>
              <Text variant="caption" color="secondary">
                {layoutSummary(t, tables)}
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
          <TemplatePreview tables={draft.tables} className={styles.previewSvg} />
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
        open={pendingTemplate !== null}
        title={t("onboarding.floorPlan.replaceTitle")}
        description={
          pendingTemplate
            ? t("onboarding.floorPlan.replaceDescription", {
                name: t(`onboarding.floorPlan.templates.${pendingTemplate.id}.name`),
              })
            : undefined
        }
        confirmLabel={t("onboarding.floorPlan.replaceConfirm")}
        cancelLabel={t("onboarding.floorPlan.replaceCancel")}
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
