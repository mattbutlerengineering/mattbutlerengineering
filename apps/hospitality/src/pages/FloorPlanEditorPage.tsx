import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useBlocker, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ConfirmDialog, Button, Heading, Text } from "@mattbutlerengineering/rialto";
import type { CreateTableRequest, FloorMaterial, WallLayout } from "@mbe/types";
import { AddTableDialog, FloorPlanCanvas } from "../components/floor-plan";
import { TableDetailsForm } from "../components/floor-plan/TableDetailsForm.js";
import { WallsPanel } from "../components/floor-plan/WallsPanel.js";
import { SectionMaterialPicker } from "../components/floor-plan/SectionMaterialPicker.js";
import { PlanFloorMaterialPicker } from "../components/floor-plan/PlanFloorMaterialPicker.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GRID_SIZE,
  moveWallEndpoint,
  type Point,
  type WallEnd,
} from "../components/floor-plan/floor-plan-geometry.js";
import { RehearsalFloorPlan } from "../components/rehearsal/RehearsalFloorPlan.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import {
  useFloorPlan,
  useActivateFloorPlan,
  useBulkUpdatePositions,
  useAddTable,
  useDeleteTable,
  useUpdateTable,
  useUpdateFloorPlanLayout,
  useFloorPlanSections,
  useUpdateFloorPlanSection,
} from "../hooks/useFloorPlans.js";
import { useFloorPlanDraft, type PositionUpdate } from "../hooks/useFloorPlanDraft.js";
import { REHEARSAL_PARAM } from "../utils/timeline-intent.js";
import { useTableStatuses } from "../hooks/useSSESync.js";
import styles from "./FloorPlanEditorPage.module.css";

function LiveFloorPlanEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: floorPlan, isLoading, error, refetch } = useFloorPlan(id);
  const { statuses: tableStatuses, isStale } = useTableStatuses();

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  // The details form reports its own unsaved edits; selecting another table
  // remounts the form (key={table.id}), so the flag resets with the selection.
  const [tableFormDirty, setTableFormDirty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const activateMutation = useActivateFloorPlan();
  const bulkUpdateMutation = useBulkUpdatePositions();
  const addTableMutation = useAddTable();
  const deleteTableMutation = useDeleteTable();
  const updateTableMutation = useUpdateTable();
  const layoutMutation = useUpdateFloorPlanLayout();

  // Walls are edited as a whole-array draft over the server's copy; null = untouched.
  const [wallsDraft, setWallsDraft] = useState<WallLayout[] | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);

  const serverWalls = floorPlan?.layoutJson.walls;
  // The plan's own canvas. Room templates (#7256) create plans up to 2000x1200,
  // so neither the wall-coordinate inputs nor an endpoint drag may clamp
  // against the 800x600 default — doing so silently shortens any wall that
  // reaches past it, and the autosave below persists the result.
  const planWidth = floorPlan?.layoutJson.width || CANVAS_WIDTH;
  const planHeight = floorPlan?.layoutJson.height || CANVAS_HEIGHT;
  const walls = wallsDraft ?? serverWalls ?? [];
  const wallsDirty =
    wallsDraft !== null && JSON.stringify(wallsDraft) !== JSON.stringify(serverWalls ?? []);

  // Section rows carry the name/colour; the layout carries each zone's rectangle.
  const { data: sectionRows } = useFloorPlanSections({
    venueId: floorPlan?.venueId,
    floorPlanId: floorPlan?.id,
  });
  const sectionZones = useMemo(() => {
    const rows = new Map((sectionRows ?? []).map((row) => [row.id, row]));
    return (floorPlan?.layoutJson.sections ?? []).flatMap((rect) => {
      const row = rows.get(rect.id);
      if (!row) return [];
      return [
        { ...rect, name: row.name, color: row.color, floorMaterial: row.floorMaterial ?? null },
      ];
    });
  }, [floorPlan?.layoutJson.sections, sectionRows]);

  const sectionMutation = useUpdateFloorPlanSection();
  const venueId = floorPlan?.venueId;
  const handleMaterialChange = useCallback(
    async (sectionId: string, floorMaterial: FloorMaterial | null) => {
      if (!venueId) return;
      setActionError(null);
      try {
        await sectionMutation.mutateAsync({ venueId, sectionId, data: { floorMaterial } });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t("floorPlan.editor.saveFailed"));
      }
    },
    [venueId, sectionMutation, t]
  );

  // The plan floor saves on pick, like a section's. Spreading the whole saved layout keeps
  // every other key (walls, sections, grid) the write would otherwise replace.
  const handlePlanFloorChange = useCallback(
    async (floorMaterial: FloorMaterial | null) => {
      if (!floorPlan) return;
      setActionError(null);
      try {
        await layoutMutation.mutateAsync({
          floorPlanId: floorPlan.id,
          layoutJson: { ...floorPlan.layoutJson, floorMaterial },
        });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t("floorPlan.editor.saveFailed"));
      }
    },
    [floorPlan, layoutMutation, t]
  );

  const floorPlanId = floorPlan?.id;
  const persist = useCallback(
    (positions: PositionUpdate[]) => {
      if (!floorPlanId) return Promise.reject(new Error(t("floorPlan.editor.notLoaded")));
      return bulkUpdateMutation.mutateAsync({ floorPlanId, positions });
    },
    [bulkUpdateMutation, floorPlanId, t]
  );

  const {
    tables,
    move: handleTableMove,
    save: saveDraft,
    addTable,
    removeTable,
    dirty: tablesDirty,
    hasUnsentEdits,
    isSaving,
    saveFailure,
  } = useFloorPlanDraft({ serverTables: floorPlan?.tables, persist });
  const draftSaveError = saveFailure
    ? saveFailure.error instanceof Error
      ? saveFailure.error.message
      : t("floorPlan.editor.saveFailed")
    : null;
  const saveError = draftSaveError ?? actionError;
  const hasChanges = tablesDirty || wallsDirty;

  // A new save attempt supersedes any stale set-active/delete error.
  const handleSave = useCallback(async () => {
    setActionError(null);
    await saveDraft();
    if (wallsDirty && floorPlan && wallsDraft) {
      try {
        await layoutMutation.mutateAsync({
          floorPlanId: floorPlan.id,
          layoutJson: { ...floorPlan.layoutJson, walls: wallsDraft },
        });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t("floorPlan.editor.saveFailed"));
      }
    }
  }, [saveDraft, wallsDirty, floorPlan, wallsDraft, layoutMutation, t]);

  // Warn on browser tab close / refresh when unsaved changes exist
  useEffect(() => {
    if (!hasChanges && !tableFormDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges, tableFormDirty]);

  // Block SPA navigation when unsaved changes exist
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (hasChanges || tableFormDirty) && currentLocation.pathname !== nextLocation.pathname
  );

  // Stable identity (functional update over the draft-or-server walls) so WallShape's memo holds.
  const handleWallEndpointMove = useCallback(
    (wallId: string, end: WallEnd, p: Point) =>
      setWallsDraft((prev) =>
        (prev ?? serverWalls ?? []).map((w) =>
          w.id === wallId
            ? moveWallEndpoint(w, end, p, GRID_SIZE, { width: planWidth, height: planHeight })
            : w
        )
      ),
    [serverWalls, planWidth, planHeight]
  );

  const requestDeleteTable = useCallback((tableId: string) => {
    setPendingDeleteId(tableId);
  }, []);

  const confirmDeleteTable = useCallback(async () => {
    const tableId = pendingDeleteId;
    if (!tableId) return;
    setPendingDeleteId(null);

    try {
      await deleteTableMutation.mutateAsync(tableId);
      removeTable(tableId);
      setSelectedTableId((prev) => (prev === tableId ? null : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("floorPlan.editor.deleteFailed"));
    }
  }, [pendingDeleteId, deleteTableMutation, removeTable, t]);

  // Auto-save with 1s debounce after changes.
  // Skip when the draft save failed — user must retry manually to avoid an infinite retry loop.
  // Set-active/delete errors are not save failures and must not gate autosave.
  useEffect(() => {
    if (!hasUnsentEdits || draftSaveError) return;
    const timer = setTimeout(() => {
      handleSave();
    }, 1000);
    return () => clearTimeout(timer);
  }, [hasUnsentEdits, handleSave, draftSaveError]);

  // Window-level shortcuts: save and deselect only. Table nudge/delete are owned
  // by FloorPlanCanvas (focus-scoped), so open dialogs never trigger them.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      if (e.key === "Escape") {
        setSelectedTableId(null);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const handleActivate = async () => {
    if (!floorPlan) return;
    try {
      await activateMutation.mutateAsync(floorPlan.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("floorPlan.editor.activateFailed"));
    }
  };

  const handleAddTable = async (data: CreateTableRequest) => {
    const newTable = await addTableMutation.mutateAsync(data);
    addTable(newTable);
    setShowAddDialog(false);
  };

  const selectedTable = tables.find((t) => t.id === selectedTableId);
  // displayError only covers query-load failures. Save/mutation errors use saveError
  // and are shown inline so the floor plan editor remains accessible.
  const displayError = error ? error.message : null;

  if (isLoading) {
    return (
      <div className={styles.loadingWrapper} aria-busy="true">
        <div className={styles.spinner} aria-label={t("floorPlan.editor.loading")} role="status" />
      </div>
    );
  }

  if (displayError || !floorPlan) {
    return (
      <div className={styles.errorContainer}>
        <ErrorRetryBanner
          error={displayError ?? t("floorPlan.editor.notFound")}
          onRetry={refetch}
        />
        <Button onClick={() => navigate("/floor-plans")} className={styles.backLink}>
          {t("floorPlan.editor.backToList")}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Button
            onClick={() => navigate("/floor-plans")}
            className={styles.backButton}
            aria-label={t("floorPlan.editor.backAria")}
          >
            <svg className={styles.backIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Button>
          <Heading className={styles.floorPlanTitle}>{floorPlan.name}</Heading>
          {floorPlan.isActive && (
            <Text className={styles.activeBadge}>{t("floorPlan.editor.active")}</Text>
          )}
        </div>

        <div className={styles.headerRight}>
          {!floorPlan.isActive && (
            <Button onClick={handleActivate} className={styles.activateButton}>
              {t("floorPlan.editor.setActive")}
            </Button>
          )}
          <Button onClick={() => setShowAddDialog(true)} className={styles.addTableButton}>
            {t("floorPlan.editor.addTable")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving || layoutMutation.isPending}
            className={`${styles.saveButton} ${hasChanges ? styles.saveButtonActive : styles.saveButtonDisabled}`}
          >
            {isSaving
              ? t("floorPlan.editor.saving")
              : hasChanges
                ? t("floorPlan.editor.saveChanges")
                : t("floorPlan.editor.saved")}
          </Button>
        </div>
      </div>

      {/* Inline save/mutation error — shown without replacing the editor */}
      {saveError && <ErrorRetryBanner error={saveError} onRetry={handleSave} />}

      {/* Add Table dialog */}
      {showAddDialog && (
        <AddTableDialog
          venueId={floorPlan.venueId}
          floorPlanId={floorPlan.id}
          canvas={{ width: planWidth, height: planHeight }}
          existingTables={tables.flatMap((t) => {
            const m = t.shapeMetadata;
            return m ? [{ x: m.x, y: m.y, width: m.width, height: m.height }] : [];
          })}
          onSubmit={handleAddTable}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {/* Main content */}
      <div className={styles.content}>
        {/* Canvas */}
        <div className={styles.canvasArea}>
          <FloorPlanCanvas
            floorPlan={floorPlan}
            tables={tables}
            onTableMove={handleTableMove}
            onTableSelect={(id) => {
              setSelectedTableId(id);
              setTableFormDirty(false);
            }}
            selectedTableId={selectedTableId}
            onDeleteRequest={requestDeleteTable}
            sections={sectionZones}
            walls={walls}
            selectedWallId={selectedWallId}
            onWallSelect={setSelectedWallId}
            onWallEndpointMove={handleWallEndpointMove}
            tableStatuses={tableStatuses}
            isStale={isStale}
          />
        </div>

        {/* Sidebar - Table details */}
        <div className={styles.sidebar}>
          <Heading className={styles.sidebarTitle}>{t("floorPlan.editor.detailsTitle")}</Heading>

          {selectedTable ? (
            <TableDetailsForm
              key={selectedTable.id}
              table={selectedTable}
              onSave={async (tableId, changes) => {
                await updateTableMutation.mutateAsync({ tableId, changes });
                setTableFormDirty(false);
              }}
              onDelete={requestDeleteTable}
              onDirtyChange={setTableFormDirty}
            />
          ) : (
            <div className={styles.noSelection}>{t("floorPlan.editor.noSelection")}</div>
          )}

          <div>
            <Text className={styles.detailLabel}>{t("floorPlan.planFloor.label")}</Text>
            <PlanFloorMaterialPicker
              value={floorPlan.layoutJson.floorMaterial}
              disabled={layoutMutation.isPending}
              onChange={handlePlanFloorChange}
            />
          </div>

          {sectionRows && sectionRows.length > 0 && (
            <section aria-labelledby="floor-plan-sections-title">
              <Heading id="floor-plan-sections-title" className={styles.sidebarTitle}>
                {t("floorPlan.sections.title")}
              </Heading>
              <ul>
                {sectionRows.map((row) => (
                  <li key={row.id}>
                    <Text className={styles.detailLabel}>{row.name}</Text>{" "}
                    <Text className={styles.detailValue}>
                      {t("floorPlan.sections.tableCount", {
                        count: tables.filter((table) => table.sectionId === row.id).length,
                      })}
                    </Text>
                    <SectionMaterialPicker
                      section={row}
                      disabled={sectionMutation.isPending}
                      onChange={(material) => handleMaterialChange(row.id, material)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <WallsPanel
            walls={walls}
            selectedId={selectedWallId}
            onChange={setWallsDraft}
            onSelect={setSelectedWallId}
            planWidth={planWidth}
            planHeight={planHeight}
          />

          {/* Table list */}
          <div className={styles.tableListSection}>
            <Heading className={styles.tableListTitle}>
              {t("floorPlan.editor.allTables", { n: tables.length })}
            </Heading>
            <div className={styles.tableListStack}>
              {tables.map((table) => (
                <Button
                  key={table.id}
                  onClick={() => setSelectedTableId(table.id)}
                  className={`${styles.tableListButton} ${
                    table.id === selectedTableId ? styles.tableListButtonSelected : ""
                  }`}
                >
                  {table.tableNumber || table.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Unsaved changes navigation warning */}
      {blocker.state === "blocked" && (
        <ConfirmDialog
          open
          title={t("floorPlan.editor.unsavedTitle")}
          description={t("floorPlan.editor.unsavedDescription")}
          confirmLabel={t("floorPlan.editor.leave")}
          cancelLabel={t("floorPlan.editor.stay")}
          variant="destructive"
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}

      {/* Delete table confirmation */}
      {pendingDeleteId && (
        <ConfirmDialog
          open
          title={t("floorPlan.editor.deleteTitle")}
          description={t("floorPlan.editor.deleteDescription")}
          confirmLabel={t("floorPlan.editor.delete")}
          cancelLabel={t("floorPlan.editor.cancel")}
          variant="destructive"
          onConfirm={confirmDeleteTable}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}

/**
 * Rehearsal mode (`?rehearsal=true`, Dress Rehearsal): the plan is read, then a client-side
 * simulated service drives its table statuses. None of the editor's mutation hooks mount, so
 * nothing here can write to the API.
 */
function RehearsalFloorPlanPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: floorPlan, isLoading, error, refetch } = useFloorPlan(id);

  if (isLoading) {
    return (
      <div className={styles.loadingWrapper} aria-busy="true">
        <div className={styles.spinner} aria-label={t("floorPlan.editor.loading")} role="status" />
      </div>
    );
  }
  if (error || !floorPlan) {
    return (
      <div className={styles.errorContainer}>
        <ErrorRetryBanner
          error={error ? error.message : t("floorPlan.editor.notFound")}
          onRetry={refetch}
        />
      </div>
    );
  }
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Heading className={styles.floorPlanTitle}>{floorPlan.name}</Heading>
      </div>
      <div className={styles.content}>
        <div className={styles.canvasArea}>
          <RehearsalFloorPlan floorPlan={floorPlan} />
        </div>
      </div>
    </div>
  );
}

export function FloorPlanEditorPage() {
  const [searchParams] = useSearchParams();
  return searchParams.get(REHEARSAL_PARAM) === "true" ? (
    <RehearsalFloorPlanPage />
  ) : (
    <LiveFloorPlanEditorPage />
  );
}
