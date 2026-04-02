import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { Badge, Button, EmptyState, Skeleton, SkeletonGroup, Text } from "@mbe/rialto";
import type { FloorPlan } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { NewFloorPlanDialog } from "../components/floor-plan";
import styles from "./FloorPlansPage.module.css";

/* ── Loading skeleton ───────────────────────── */

function FloorPlansLoadingSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Floor Plans" description="Design and manage your venue layouts" />
      <SkeletonGroup>
        <div className={styles.grid}>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} variant="card" width="100%" height={220} />
          ))}
        </div>
      </SkeletonGroup>
    </div>
  );
}

/* ── Main component ─────────────────────────── */

export function FloorPlansPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { selectedVenueId } = useVenue();
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  const fetchFloorPlans = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const floorPlansResponse = await api.floorPlans.list({
        venueId: selectedVenueId ?? undefined,
        limit: 50,
      });
      setFloorPlans(floorPlansResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load floor plans");
    } finally {
      setIsLoading(false);
    }
  }, [api, selectedVenueId]);

  useEffect(() => {
    fetchFloorPlans();
  }, [fetchFloorPlans]);

  const handleCreate = useCallback(
    async (data: Parameters<typeof api.floorPlans.create>[0]) => {
      return api.floorPlans.create(data);
    },
    [api]
  );

  const handleCreated = useCallback(
    (floorPlan: FloorPlan) => {
      navigate(`/floor-plans/${floorPlan.id}`);
    },
    [navigate]
  );

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString();
  };

  if (isLoading && floorPlans.length === 0) {
    return <FloorPlansLoadingSkeleton />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <PageHeader title="Floor Plans" description="Design and manage your venue layouts" />
        <Button
          variant="primary"
          onClick={() => setShowNewDialog(true)}
          disabled={!selectedVenueId}
        >
          New Floor Plan
        </Button>
      </div>

      {showNewDialog && selectedVenueId && (
        <NewFloorPlanDialog
          venueId={selectedVenueId}
          onCreate={handleCreate}
          onCreated={handleCreated}
          onClose={() => setShowNewDialog(false)}
        />
      )}

      {error && (
        <ErrorRetryBanner
          error={error}
          onRetry={fetchFloorPlans}
          onDismiss={() => setError(null)}
        />
      )}

      {!isLoading && !error && floorPlans.length === 0 && (
        <EmptyState
          heading="No floor plans yet"
          description="Create a floor plan to start arranging tables for your venue."
        />
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
                  aria-hidden="true"
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
                  <Text variant="body" color="primary" className={styles.cardName}>
                    {floorPlan.name}
                  </Text>
                  {floorPlan.isActive && (
                    <Badge variant="success" size="sm">
                      Active
                    </Badge>
                  )}
                </div>
                <div className={styles.cardDetails}>
                  <Text variant="caption" color="secondary">
                    {floorPlan.tables?.length ?? 0} tables
                  </Text>
                  <Text variant="caption" color="secondary">
                    Updated {formatDate(floorPlan.updatedAt)}
                  </Text>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
