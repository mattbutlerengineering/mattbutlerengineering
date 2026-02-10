import { useState, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { FloorPlan } from "@mbe/types";

export function FloorPlansPage() {
  const { accessToken } = useAuth();
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFloorPlans() {
      setIsLoading(true);
      setError(null);

      try {
        const api = createApiClient({
          baseUrl: import.meta.env.VITE_API_URL ?? "",
          getAccessToken: () => accessToken,
        });

        const response = await api.floorPlans.list({ limit: 50 });
        setFloorPlans(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load floor plans");
      } finally {
        setIsLoading(false);
      }
    }

    fetchFloorPlans();
  }, [accessToken]);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Floor Plans</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          New Floor Plan
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-4">{error}</div>
      )}

      {!isLoading && !error && floorPlans.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="mb-4">No floor plans yet</p>
          <p className="text-sm">
            Create a floor plan to start arranging tables for your venue.
          </p>
        </div>
      )}

      {!isLoading && !error && floorPlans.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {floorPlans.map((floorPlan) => (
            <div
              key={floorPlan.id}
              className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
            >
              {/* Placeholder for floor plan preview */}
              <div className="h-40 bg-gray-100 flex items-center justify-center">
                <svg
                  className="w-16 h-16 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-medium text-gray-900">{floorPlan.name}</h3>
                  {floorPlan.isActive && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  <p>{floorPlan.tables?.length ?? 0} tables</p>
                  <p>Updated {formatDate(floorPlan.updatedAt)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
