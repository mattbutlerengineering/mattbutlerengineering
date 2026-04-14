import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { ConfirmDialog } from "@mattbutlerengineering/rialto";
import type { CreateTableRequest, FloorPlan, Table } from "@mbe/types";
import { AddTableDialog, FloorPlanCanvas } from "../components/floor-plan";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import styles from "./FloorPlanEditorPage.module.css";

export function FloorPlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Track pending position updates for batch save
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, { x: number; y: number }>>(
    new Map()
  );

  // Store previous table state for rollback on save failure
  const previousTablesRef = useRef<Table[]>([]);

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

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  const fetchFloorPlan = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const fp = await api.floorPlans.get(id);
      setFloorPlan(fp);
      setTables(fp.tables ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load floor plan");
    } finally {
      setIsLoading(false);
    }
  }, [id, api]);

  useEffect(() => {
    fetchFloorPlan();
  }, [fetchFloorPlan]);

  const handleTableMove = useCallback((tableId: string, x: number, y: number) => {
    // Update local state immediately for responsiveness
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== tableId) return t;
        // Preserve existing metadata or use defaults
        const existing = t.shapeMetadata ?? {
          width: 80,
          height: 60,
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
    if (pendingUpdates.size === 0) return;

    // Snapshot current tables for rollback on failure
    previousTablesRef.current = [...tables];

    setIsSaving(true);
    try {
      const positions = Array.from(pendingUpdates.entries()).map(([tableId, pos]) => {
        const table = tables.find((t) => t.id === tableId);
        // Build full shapeMetadata, using existing values or defaults
        const existing = table?.shapeMetadata;
        return {
          tableId,
          shapeMetadata: {
            x: pos.x,
            y: pos.y,
            width: existing?.width ?? 80,
            height: existing?.height ?? 60,
            shape: existing?.shape ?? ("rectangle" as const),
            rotation: existing?.rotation,
            color: existing?.color,
          },
        };
      });

      await api.floorPlans.bulkUpdatePositions(floorPlan!.id, positions);
      setPendingUpdates(new Map());
      setHasChanges(false);
    } catch (err) {
      // Rollback to previous table positions on failure
      setTables(previousTablesRef.current);
      setPendingUpdates(new Map());
      setError(err instanceof Error ? err.message : "Failed to save changes — positions reverted");
    } finally {
      setIsSaving(false);
    }
  }, [pendingUpdates, tables, api, floorPlan]);

  const handleDeleteTable = useCallback(async (tableId: string) => {
    const confirmed = window.confirm("Delete this table? This action cannot be undone.");
    if (!confirmed) return;

    try {
      await api.tables.delete(tableId);
      setTables((prev) => prev.filter((t) => t.id !== tableId));
      setSelectedTableId((prev) => (prev === tableId ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete table");
    }
  }, [api]);

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
      // Don't capture shortcuts when typing in inputs/dialogs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Ctrl+S / Cmd+S — save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      // Delete / Backspace — remove selected table
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedTableId) {
          handleDeleteTable(selectedTableId);
        }
        return;
      }

      // Escape — deselect
      if (e.key === "Escape") {
        setSelectedTableId(null);
        return;
      }

      // Arrow keys — nudge selected table by 1 grid unit (20px)
      if (
        selectedTableId &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
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
      const updated = await api.floorPlans.activate(floorPlan.id);
      setFloorPlan(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate floor plan");
    }
  };

  const handleAddTable = async (data: CreateTableRequest) => {
    const newTable = await api.tables.create(data);
    setTables((prev) => [...prev, newTable]);
    setShowAddDialog(false);
  };

  const selectedTable = tables.find((t) => t.id === selectedTableId);

  if (isLoading) {
    return (
      <div className={styles.loadingWrapper} aria-busy="true">
        <div className={styles.spinner} aria-label="Loading" role="status" />
      </div>
    );
  }

  if (error || !floorPlan) {
    return (
      <div className={styles.errorContainer}>
        <ErrorRetryBanner
          error={error ?? "Floor plan not found"}
          onRetry={fetchFloorPlan}
        />
        <button onClick={() => navigate("/floor-plans")} className={styles.backLink}>
          Back to Floor Plans
        </button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            onClick={() => navigate("/floor-plans")}
            className={styles.backButton}
            aria-label="Back to floor plans"
          >
            <svg className={styles.backIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className={styles.floorPlanTitle}>{floorPlan.name}</h1>
          {floorPlan.isActive && <span className={styles.activeBadge}>Active</span>}
        </div>

        <div className={styles.headerRight}>
          {!floorPlan.isActive && (
            <button onClick={handleActivate} className={styles.activateButton}>
              Set as Active
            </button>
          )}
          <button onClick={() => setShowAddDialog(true)} className={styles.addTableButton}>
            + Add Table
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`${styles.saveButton} ${hasChanges ? styles.saveButtonActive : styles.saveButtonDisabled}`}
          >
            {isSaving ? "Saving..." : hasChanges ? "Save Changes" : "Saved"}
          </button>
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
          <h2 className={styles.sidebarTitle}>Table Details</h2>

          {selectedTable ? (
            <div className={styles.detailsStack}>
              <div>
                <span className={styles.detailLabel}>Name</span>
                <div className={styles.detailValue}>{selectedTable.name}</div>
              </div>
              <div>
                <span className={styles.detailLabel}>Table Number</span>
                <div className={styles.detailValue}>{selectedTable.tableNumber}</div>
              </div>
              <div>
                <span className={styles.detailLabel}>Capacity</span>
                <div className={styles.detailValue}>
                  {selectedTable.minCovers} - {selectedTable.maxCovers ?? selectedTable.capacity}{" "}
                  guests
                </div>
              </div>
              <div>
                <span className={styles.detailLabel}>Location</span>
                <div className={styles.detailValue}>{selectedTable.location ?? "Not set"}</div>
              </div>
              <div>
                <span className={styles.detailLabel}>Status</span>
                <div
                  className={
                    selectedTable.isActive ? styles.detailValueActive : styles.detailValueInactive
                  }
                >
                  {selectedTable.isActive ? "Active" : "Inactive"}
                </div>
              </div>
              <div>
                <span className={styles.detailLabel}>Position</span>
                <div className={styles.detailValueMono}>
                  x: {selectedTable.shapeMetadata?.x ?? 0}, y:{" "}
                  {selectedTable.shapeMetadata?.y ?? 0}
                </div>
              </div>
              <button
                className={styles.deleteTableButton}
                onClick={() => handleDeleteTable(selectedTable.id)}
              >
                Delete Table
              </button>
            </div>
          ) : (
            <div className={styles.noSelection}>Select a table to view details</div>
          )}

          {/* Table list */}
          <div className={styles.tableListSection}>
            <h3 className={styles.tableListTitle}>All Tables ({tables.length})</h3>
            <div className={styles.tableListStack}>
              {tables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => setSelectedTableId(table.id)}
                  className={`${styles.tableListButton} ${
                    table.id === selectedTableId ? styles.tableListButtonSelected : ""
                  }`}
                >
                  {table.tableNumber || table.name}
                </button>
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
