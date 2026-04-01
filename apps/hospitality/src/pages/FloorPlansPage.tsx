import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { FloorPlan } from "@mbe/types";
import { Button, Card, Text, Stack, Badge, EmptyState, Alert } from "@mbe/rialto";
import { NewFloorPlanDialog } from "../components/floor-plan";
import styles from "./FloorPlansPage.module.css";

export function FloorPlansPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const [floorPlansResponse, venuesResponse] = await Promise.all([
          api.floorPlans.list({ limit: 50 }),
          api.venues.list({ limit: 1 }),
        ]);
        setFloorPlans(floorPlansResponse.data);
        if (venuesResponse.data.length > 0) {
          setVenueId(venuesResponse.data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load floor plans");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [api]);

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

  return (
    <Stack gap="lg" className={styles.container}>
      <Stack direction="row" align="center" justify="between">
        <Text variant="display" as="h1">
          Floor Plans
        </Text>
        <Button variant="primary" onClick={() => setShowNewDialog(true)} disabled={!venueId}>
          New Floor Plan
        </Button>
      </Stack>

      {showNewDialog && venueId && (
        <NewFloorPlanDialog
          venueId={venueId}
          onCreate={handleCreate}
          onCreated={handleCreated}
          onClose={() => setShowNewDialog(false)}
        />
      )}

      {isLoading && (
        <div className={styles.loadingWrapper} aria-busy="true">
          <div className={styles.spinner} aria-label="Loading" role="status" />
        </div>
      )}

      {error && (
        <Alert variant="error" title="Error">
          {error}
        </Alert>
      )}

      {!isLoading && !error && floorPlans.length === 0 && (
        <EmptyState
          heading="No floor plans yet"
          description="Create a floor plan to start arranging tables for your venue."
          action={
            <Button variant="primary" onClick={() => setShowNewDialog(true)} disabled={!venueId}>
              New Floor Plan
            </Button>
          }
        />
      )}

      {!isLoading && !error && floorPlans.length > 0 && (
        <div className={styles.grid}>
          {floorPlans.map((floorPlan) => (
            <Card
              key={floorPlan.id}
              variant="elevated"
              className={styles.card}
              onClick={() => navigate(`/floor-plans/${floorPlan.id}`)}
              role="button"
              tabIndex={0}
              aria-label={`Open floor plan: ${floorPlan.name}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/floor-plans/${floorPlan.id}`);
                }
              }}
            >
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
              <Stack gap="xs" className={styles.cardBody}>
                <Stack direction="row" align="center" justify="between">
                  <Text variant="label" as="h3" className={styles.cardName}>
                    {floorPlan.name}
                  </Text>
                  {floorPlan.isActive && (
                    <Badge variant="success" size="sm">
                      Active
                    </Badge>
                  )}
                </Stack>
                <Stack direction="row" gap="sm">
                  <Text variant="caption" color="secondary">
                    {floorPlan.tables?.length ?? 0} tables
                  </Text>
                  <Text variant="caption" color="secondary">
                    Updated {formatDate(floorPlan.updatedAt)}
                  </Text>
                </Stack>
              </Stack>
            </Card>
          ))}
        </div>
      )}
    </Stack>
  );
}
