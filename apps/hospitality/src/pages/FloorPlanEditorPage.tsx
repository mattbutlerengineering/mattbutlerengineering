import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { ConfirmDialog, Button, Heading, Text } from "@mattbutlerengineering/rialto";
import type { CreateTableRequest, Table } from "@mbe/types";
import { AddTableDialog, FloorPlanCanvas } from "../components/floor-plan";
import { SHAPE_DEFAULTS } from "../components/floor-plan/floor-plan-geometry.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import {
  useFloorPlan,
  useActivateFloorPlan,
  useBulkUpdatePositions,
  useAddTable,
  useDeleteTable,
} from "../hooks/useFloorPlans.js";
import styles from "./FloorPlanEditorPage.module.css";

export function FloorPlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: floorPlan, isLoading, error, refetch } = useFloorPlan(id);

  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Track pending position updates for batch save
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, { x: number; y: number }>>(
    () => new Map()
  );

  // Store previous table state for rollback on save failure
  const previousTablesRef = useRef<Table[]>([]);

  // Sync tables from the TQ query result
  useEffect(() => {
    if (floorPlan?.tables) {
      setTables(floorPlan.tables);
    }
  }, [floorPlan]);

  const activateMutation = useActivateFloorPlan();
  const bulkUpdateMutation = useBulkUpdatePositions();
  const addTableMutation = useAddTable();
  const deleteTableMutation = useDeleteTable();

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

  const handleTableMove = useCallback((tableId: string, x: number, y: number) => {
    // Update local state immediately for responsiveness
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        const existing = t.shapeMetadata ?? {
          ...SHAPE_DEFAULTS.rectangle,
          shape: "rectangle" as const,
        };
        return {
          ...t,
          shapeMetadata: { ...existing, x, y },
        };
      })
    );

    // Track pending update
    setPendingUpdates((prev) => new Map(prev).set(tableId, { x, y }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (pendingUpdates.size === 0 || !floorPlan) return;

    // Snapshot current tables for rollback on failure
    previousTablesRef.current = [...tables];

    setIsSaving(true);
    setSaveError(null);
    try {
      const positions = Array.from(pendingUpdates.entries()).map(([tableId, pos]) => {
        const table = tables.find((t) => t.id === tableId);
        const existing = table?.shapeMetadata;
        return {
          tableId,
          shapeMetadata: {
            x: pos.x,
            y: pos.y,
            width: existing?.width ?? SHAPE_DEFAULTS.rectangle.width,
            height: existing?.height ?? SHAPE_DEFAULTS.rectangle.height,
            shape: existing?.shape ?? ("rectangle" as const),
            rotation: existing?.rotation,
            color: existing?.color,
          },
        };
      });

      await bulkUpdateMutation.mutateAsync({ floorPlanId: floorPlan.id, positions });
      setPendingUpdates(new Map());
      setHasChanges(false);
    } catch (err) {
      // Rollback to previous table positions on failure
      setTables(previousTablesRef.current);
      setPendingUpdates(new Map());
      setSaveError(
        err instanceof Error ? err.message : "Failed to save changes — positions reverted"
      );
    } finally {
      setIsSaving(false);
    }
  }, [pendingUpdates, tables, bulkUpdateMutation, floorPlan]);

  const handleDeleteTable = useCallback(
    async (tableId: string) => {
      const confirmed = window.confirm("Delete this table? This action cannot be undone.");
      if (!confirmed) return;

      try {
        await deleteTableMutation.mutateAsync(tableId);
        setTables((prev) => prev.filter((t) => t.id !== tableId));
        setSelectedTableId((prev) => (prev === tableId ? null : prev));
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Failed to delete table");
      }
    },
    [deleteTableMutation]
  );

  // Auto-save with 1s debounce after changes
  useEffect(() => {
    if (!hasChanges || pendingUpdates.size === 0) return;
    const timer = setTimeout(() => {
      handleSave();
    }, 1000);
    return () => clearTimeout(timer);
  }, [hasChanges, pendingUpdates, handleSave]);

  // Keyboard shortcuts
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

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedTableId) {
          handleDeleteTable(selectedTableId);
        }
        return;
      }

      if (e.key === "Escape") {
        setSelectedTableId(null);
        return;
      }

      if (selectedTableId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const selectedTable = tables.find((t) => t.id === selectedTableId);
        if (!selectedTable) return;
        const currentX = selectedTable.shapeMetadata?.x ?? 100;
        const currentY = selectedTable.shapeMetadata?.y ?? 100;
        const dx = e.key === "ArrowRight" ? 20 : e.key === "ArrowLeft" ? -20 : 0;
        const dy = e.key === "ArrowDown" ? 20 : e.key === "ArrowUp" ? -20 : 0;
        handleTableMove(selectedTableId, currentX + dx, currentY + dy);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedTableId, tables, handleSave, handleDeleteTable, handleTableMove]);

  const handleActivate = async () => {
    if (!floorPlan) return;
    try {
      await activateMutation.mutateAsync(floorPlan.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to activate floor plan");
    }
  };

  const handleAddTable = async (data: CreateTableRequest) => {
    const newTable = await addTableMutation.mutateAsync(data);
    setTables((prev) => [...prev, newTable]);
    setShowAddDialog(false);
  };

  const selectedTable = tables.find((t) => t.id === selectedTableId);
  const displayError = saveError ?? (error ? error.message : null);

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
                onClick={() => handleDeleteTable(selectedTable.id)}
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
    </div>
  );
}
