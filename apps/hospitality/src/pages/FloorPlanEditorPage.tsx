import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { FloorPlan, Table } from "@mbe/types";
import { FloorPlanCanvas } from "../components/floor-plan";

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
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !floorPlan) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-md">
          {error ?? "Floor plan not found"}
        </div>
        <button
          onClick={() => navigate("/floor-plans")}
          className="mt-4 text-blue-600 hover:underline"
        >
          Back to Floor Plans
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/floor-plans")}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">{floorPlan.name}</h1>
          {floorPlan.isActive && (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
              Active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!floorPlan.isActive && (
            <button
              onClick={handleActivate}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Set as Active
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`px-4 py-1.5 text-sm rounded-md ${
              hasChanges
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isSaving ? "Saving..." : hasChanges ? "Save Changes" : "Saved"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 p-4 overflow-auto">
          <FloorPlanCanvas
            floorPlan={floorPlan}
            tables={tables}
            onTableMove={handleTableMove}
            onTableSelect={setSelectedTableId}
            selectedTableId={selectedTableId}
          />
        </div>

        {/* Sidebar - Table details */}
        <div className="w-64 border-l bg-white p-4 overflow-auto">
          <h2 className="font-medium text-gray-900 mb-4">Table Details</h2>

          {selectedTable ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <div className="font-medium">{selectedTable.name}</div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Table Number</label>
                <div className="font-medium">{selectedTable.tableNumber}</div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Capacity</label>
                <div className="font-medium">
                  {selectedTable.minCovers} - {selectedTable.maxCovers ?? selectedTable.capacity} guests
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Location</label>
                <div className="font-medium">{selectedTable.location ?? "Not set"}</div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Status</label>
                <div className={`font-medium ${selectedTable.isActive ? "text-green-600" : "text-gray-400"}`}>
                  {selectedTable.isActive ? "Active" : "Inactive"}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Position</label>
                <div className="font-mono text-sm">
                  x: {selectedTable.shapeMetadata?.x ?? 0}, y: {selectedTable.shapeMetadata?.y ?? 0}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-sm">
              Select a table to view details
            </div>
          )}

          {/* Table list */}
          <div className="mt-8">
            <h3 className="font-medium text-gray-900 mb-2">All Tables ({tables.length})</h3>
            <div className="space-y-1">
              {tables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => setSelectedTableId(table.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                    table.id === selectedTableId
                      ? "bg-blue-50 text-blue-700"
                      : "hover:bg-gray-50"
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
