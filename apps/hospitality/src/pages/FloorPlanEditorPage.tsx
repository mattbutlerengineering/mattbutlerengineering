import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useBlocker } from "react-router";
import { ConfirmDialog, Button, Heading, Text } from "@mattbutlerengineering/rialto";
import type { CreateTableRequest } from "@mbe/types";
import { AddTableDialog, FloorPlanCanvas } from "../components/floor-plan";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import {
  useFloorPlan,
  useActivateFloorPlan,
  useBulkUpdatePositions,
  useAddTable,
  useDeleteTable,
} from "../hooks/useFloorPlans.js";
import { useFloorPlanDraft, type PositionUpdate } from "../hooks/useFloorPlanDraft.js";
import { useTableStatuses } from "../hooks/useSSESync.js";
import styles from "./FloorPlanEditorPage.module.css";

export function FloorPlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: floorPlan, isLoading, error, refetch } = useFloorPlan(id);
  const { statuses: tableStatuses, isStale } = useTableStatuses();

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const activateMutation = useActivateFloorPlan();
  const bulkUpdateMutation = useBulkUpdatePositions();
  const addTableMutation = useAddTable();
  const deleteTableMutation = useDeleteTable();

  const floorPlanId = floorPlan?.id;
  const persist = useCallback(
    (positions: PositionUpdate[]) => {
      if (!floorPlanId) return Promise.reject(new Error("Floor plan not loaded"));
      return bulkUpdateMutation.mutateAsync({ floorPlanId, positions });
    },
    [bulkUpdateMutation, floorPlanId]
  );

  const {
    tables,
    move: handleTableMove,
    save: saveDraft,
    addTable,
    removeTable,
    dirty: hasChanges,
    hasUnsentEdits,
    isSaving,
    saveFailure,
  } = useFloorPlanDraft({ serverTables: floorPlan?.tables, persist });
  const draftSaveError = saveFailure
    ? saveFailure.error instanceof Error
      ? saveFailure.error.message
      : "Failed to save changes — positions reverted"
    : null;
  const saveError = draftSaveError ?? actionError;

  // A new save attempt supersedes any stale set-active/delete error.
  const handleSave = useCallback(async () => {
    setActionError(null);
    await saveDraft();
  }, [saveDraft]);

  // Warn on browser tab close / refresh when unsaved changes exist
  useEffect(() => {
    if (!hasChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  // Block SPA navigation when unsaved changes exist
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges && currentLocation.pathname !== nextLocation.pathname
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
      setActionError(err instanceof Error ? err.message : "Failed to delete table");
    }
  }, [pendingDeleteId, deleteTableMutation, removeTable]);

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
      setActionError(err instanceof Error ? err.message : "Failed to activate floor plan");
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
        <div className={styles.spinner} aria-label="Loading" role="status" />
      </div>
    );
  }

  if (displayError || !floorPlan) {
    return (
      <div className={styles.errorContainer}>
        <ErrorRetryBanner error={displayError ?? "Floor plan not found"} onRetry={refetch} />
        <Button onClick={() => navigate("/floor-plans")} className={styles.backLink}>
          Back to Floor Plans
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
            aria-label="Back to floor plans"
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
          {floorPlan.isActive && <Text className={styles.activeBadge}>Active</Text>}
        </div>

        <div className={styles.headerRight}>
          {!floorPlan.isActive && (
            <Button onClick={handleActivate} className={styles.activateButton}>
              Set as Active
            </Button>
          )}
          <Button onClick={() => setShowAddDialog(true)} className={styles.addTableButton}>
            + Add Table
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`${styles.saveButton} ${hasChanges ? styles.saveButtonActive : styles.saveButtonDisabled}`}
          >
            {isSaving ? "Saving..." : hasChanges ? "Save Changes" : "Saved"}
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
            onTableSelect={setSelectedTableId}
            selectedTableId={selectedTableId}
            onDeleteRequest={requestDeleteTable}
            tableStatuses={tableStatuses}
            isStale={isStale}
          />
        </div>

        {/* Sidebar - Table details */}
        <div className={styles.sidebar}>
          <Heading className={styles.sidebarTitle}>Table Details</Heading>

          {selectedTable ? (
            <div className={styles.detailsStack}>
              <div>
                <Text className={styles.detailLabel}>Name</Text>
                <div className={styles.detailValue}>{selectedTable.name}</div>
              </div>
              <div>
                <Text className={styles.detailLabel}>Table Number</Text>
                <div className={styles.detailValue}>{selectedTable.tableNumber}</div>
              </div>
              <div>
                <Text className={styles.detailLabel}>Capacity</Text>
                <div className={styles.detailValue}>
                  {selectedTable.minCovers} - {selectedTable.maxCovers ?? selectedTable.capacity}{" "}
                  guests
                </div>
              </div>
              <div>
                <Text className={styles.detailLabel}>Location</Text>
                <div className={styles.detailValue}>{selectedTable.location ?? "Not set"}</div>
              </div>
              <div>
                <Text className={styles.detailLabel}>Status</Text>
                <div
                  className={
                    selectedTable.isActive ? styles.detailValueActive : styles.detailValueInactive
                  }
                >
                  {selectedTable.isActive ? "Active" : "Inactive"}
                </div>
              </div>
              <div>
                <Text className={styles.detailLabel}>Position</Text>
                <div className={styles.detailValueMono}>
                  x: {selectedTable.shapeMetadata?.x ?? 0}, y: {selectedTable.shapeMetadata?.y ?? 0}
                </div>
              </div>
              <Button
                className={styles.deleteTableButton}
                onClick={() => requestDeleteTable(selectedTable.id)}
              >
                Delete Table
              </Button>
            </div>
          ) : (
            <div className={styles.noSelection}>Select a table to view details</div>
          )}

          {/* Table list */}
          <div className={styles.tableListSection}>
            <Heading className={styles.tableListTitle}>All Tables ({tables.length})</Heading>
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
          title="Unsaved Changes"
          description="You have unsaved changes to this floor plan. Are you sure you want to leave?"
          confirmLabel="Leave"
          cancelLabel="Stay"
          variant="destructive"
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}

      {/* Delete table confirmation */}
      {pendingDeleteId && (
        <ConfirmDialog
          open
          title="Delete this table?"
          description="This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={confirmDeleteTable}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
