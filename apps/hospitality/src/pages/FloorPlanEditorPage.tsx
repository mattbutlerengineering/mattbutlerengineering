import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { FloorPlan, Table } from "@mbe/types";
import { FloorPlanCanvas } from "../components/floor-plan";
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

  // Track pending position updates for batch save
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, { x: number; y: number }>>(
    new Map()
  );

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  useEffect(() => {
    if (!id) return;

    async function fetchFloorPlan() {
      setIsLoading(true);
      setError(null);

      try {
        const fp = await api.floorPlans.get(id!);
        setFloorPlan(fp);
        setTables(fp.tables ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load floor plan");
      } finally {
        setIsLoading(false);
      }
    }

    fetchFloorPlan();
  }, [id, api]);

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

  const handleSave = async () => {
    if (pendingUpdates.size === 0) return;

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

      await api.floorPlans.bulkUpdatePositions(positions);
      setPendingUpdates(new Map());
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!floorPlan) return;

    try {
      const updated = await api.floorPlans.activate(floorPlan.id);
      setFloorPlan(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate floor plan");
    }
  };

  const selectedTable = tables.find((t) => t.id === selectedTableId);

  if (isLoading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (error || !floorPlan) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorBox}>{error ?? "Floor plan not found"}</div>
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
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`${styles.saveButton} ${hasChanges ? styles.saveButtonActive : styles.saveButtonDisabled}`}
          >
            {isSaving ? "Saving..." : hasChanges ? "Save Changes" : "Saved"}
          </button>
        </div>
      </div>

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
                <label className={styles.detailLabel}>Name</label>
                <div className={styles.detailValue}>{selectedTable.name}</div>
              </div>
              <div>
                <label className={styles.detailLabel}>Table Number</label>
                <div className={styles.detailValue}>{selectedTable.tableNumber}</div>
              </div>
              <div>
                <label className={styles.detailLabel}>Capacity</label>
                <div className={styles.detailValue}>
                  {selectedTable.minCovers} - {selectedTable.maxCovers ?? selectedTable.capacity}{" "}
                  guests
                </div>
              </div>
              <div>
                <label className={styles.detailLabel}>Location</label>
                <div className={styles.detailValue}>{selectedTable.location ?? "Not set"}</div>
              </div>
              <div>
                <label className={styles.detailLabel}>Status</label>
                <div
                  className={
                    selectedTable.isActive ? styles.detailValueActive : styles.detailValueInactive
                  }
                >
                  {selectedTable.isActive ? "Active" : "Inactive"}
                </div>
              </div>
              <div>
                <label className={styles.detailLabel}>Position</label>
                <div className={styles.detailValueMono}>
                  x: {selectedTable.shapeMetadata?.x ?? 0}, y:{" "}
                  {selectedTable.shapeMetadata?.y ?? 0}
                </div>
              </div>
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
    </div>
  );
}
