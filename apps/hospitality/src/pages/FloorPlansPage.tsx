import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { FloorPlan } from "@mbe/types";
import styles from "./FloorPlansPage.module.css";

export function FloorPlansPage() {
  const navigate = useNavigate();
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
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Floor Plans</h1>
        <button className={styles.newButton}>New Floor Plan</button>
      </div>

      {isLoading && (
        <div className={styles.loadingWrapper}>
          <div className={styles.spinner} />
        </div>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}

      {!isLoading && !error && floorPlans.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateText}>No floor plans yet</p>
          <p className={styles.emptyStateHint}>
            Create a floor plan to start arranging tables for your venue.
          </p>
        </div>
      )}

      {!isLoading && !error && floorPlans.length > 0 && (
        <div className={styles.grid}>
          {floorPlans.map((floorPlan) => (
            <button
              key={floorPlan.id}
              onClick={() => navigate(`/floor-plans/${floorPlan.id}`)}
              className={styles.card}
              type="button"
              aria-label={`Open floor plan: ${floorPlan.name}`}
            >
              {/* Placeholder for floor plan preview */}
              <div className={styles.cardPreview}>
                <svg
                  className={styles.cardPreviewIcon}
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
              <div className={styles.cardBody}>
                <div className={styles.cardMeta}>
                  <h3 className={styles.cardName}>{floorPlan.name}</h3>
                  {floorPlan.isActive && (
                    <span className={styles.activeBadge}>Active</span>
                  )}
                </div>
                <div className={styles.cardDetails}>
                  <p>{floorPlan.tables?.length ?? 0} tables</p>
                  <p>Updated {formatDate(floorPlan.updatedAt)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
