import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  EmptyState,
  Skeleton,
  SkeletonGroup,
  Text,
} from "@mattbutlerengineering/rialto";
import type { FloorPlan } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { NewFloorPlanDialog } from "../components/floor-plan";
import { useFloorPlans, useCloneFloorPlan } from "../hooks/useFloorPlans.js";
import { useApiClient } from "../hooks/useApiClient.js";
import styles from "./FloorPlansPage.module.css";

/* ── Loading skeleton ───────────────────────── */

function FloorPlansLoadingSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Floor Plans" description="Design and manage your venue layouts" />
      <SkeletonGroup>
        <div className={styles.cardGrid}>
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
  const { selectedVenueId } = useVenue();
  const api = useApiClient();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const {
    data: floorPlans = [],
    isLoading,
    error,
    refetch,
  } = useFloorPlans({ venueId: selectedVenueId });

  const cloneMutation = useCloneFloorPlan();

  const handleCreate = useCallback(
    async (data: Parameters<typeof api.floorPlans.create>[0]) => {
      return api.floorPlans.create(data);
    },
    [api]
  );

  const handleClone = useCallback(
    async (id: string) => {
      try {
        const cloned = await cloneMutation.mutateAsync(id);
        setLiveMessage(`Floor plan "${cloned.name}" cloned successfully`);
        navigate(`/floor-plans/${cloned.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to clone floor plan";
        setLiveMessage(`Error: ${message}`);
      }
    },
    [cloneMutation, navigate]
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
      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {liveMessage}
      </div>

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

      {error && <ErrorRetryBanner error={error.message} onRetry={refetch} onDismiss={() => {}} />}

      {!isLoading && !error && floorPlans.length === 0 && (
        <EmptyState
          heading="No floor plans yet"
          description="Create a floor plan to start arranging tables for your venue."
        />
      )}

      {!isLoading && !error && floorPlans.length > 0 && (
        <div className={styles.cardGrid}>
          {floorPlans.map((floorPlan) => (
            <Button
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
                <div className={styles.cardActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClone(floorPlan.id);
                    }}
                    aria-label={`Clone floor plan: ${floorPlan.name}`}
                  >
                    Clone
                  </Button>
                </div>
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
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
