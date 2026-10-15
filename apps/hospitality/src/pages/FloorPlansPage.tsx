import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import { describeApiError } from "../lib/describe-api-error.js";
import { NewFloorPlanDialog } from "../components/floor-plan";
import { useFloorPlans, useCloneFloorPlan } from "../hooks/useFloorPlans.js";
import { useApiClient } from "../hooks/useApiClient.js";
import styles from "./FloorPlansPage.module.css";

/* ── Loading skeleton ───────────────────────── */

function FloorPlansLoadingSkeleton() {
  const { t } = useTranslation();
  return (
    <div className={styles.container}>
      <PageHeader title={t("floorPlan.list.title")} description={t("floorPlan.list.description")} />
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

/* ── Clone failure ───────────────────────────── */

interface CloneFailure {
  title: string;
  detail: string;
  raw?: string;
}

function cloneFailureFrom(err: unknown, t: TFunction): CloneFailure {
  const description = describeApiError(err);
  return {
    title: t("floorPlan.list.cloneFailed"),
    detail: description.detail,
    raw: description.raw,
  };
}

/* ── Main component ─────────────────────────── */

export function FloorPlansPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedVenueId } = useVenue();
  const api = useApiClient();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const [cloneFailure, setCloneFailure] = useState<CloneFailure | null>(null);

  const {
    data: floorPlans = [],
    isLoading,
    error,
    refetch,
  } = useFloorPlans({ venueId: selectedVenueId });
  const loadFailure = error ? describeApiError(error) : null;

  const cloneMutation = useCloneFloorPlan();

  const handleCreate = useCallback(
    async (data: Parameters<typeof api.floorPlans.create>[0]) => {
      return api.floorPlans.create(data);
    },
    [api]
  );

  const handleClone = useCallback(
    async (id: string) => {
      setCloneFailure(null);
      try {
        const cloned = await cloneMutation.mutateAsync(id);
        setLiveMessage(t("floorPlan.list.cloned", { name: cloned.name }));
        navigate(`/floor-plans/${cloned.id}`);
      } catch (err) {
        setCloneFailure(cloneFailureFrom(err, t));
      }
    },
    [cloneMutation, navigate, t]
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
        <PageHeader
          title={t("floorPlan.list.title")}
          description={t("floorPlan.list.description")}
        />
        <Button
          variant="primary"
          onClick={() => setShowNewDialog(true)}
          disabled={!selectedVenueId}
        >
          {t("floorPlan.list.newButton")}
        </Button>
      </div>

      <div data-testid="primary-content">
        {showNewDialog && selectedVenueId && (
          <NewFloorPlanDialog
            venueId={selectedVenueId}
            onCreate={handleCreate}
            onCreated={handleCreated}
            onClose={() => setShowNewDialog(false)}
          />
        )}

        {loadFailure && (
          <ErrorRetryBanner
            title={t("floorPlan.list.loadFailed")}
            error={loadFailure.detail}
            details={loadFailure.raw}
            onRetry={refetch}
            onDismiss={() => {}}
          />
        )}

        {cloneFailure && (
          <ErrorRetryBanner
            title={cloneFailure.title}
            error={cloneFailure.detail}
            details={cloneFailure.raw}
            onDismiss={() => setCloneFailure(null)}
          />
        )}

        {!isLoading && !error && floorPlans.length === 0 && (
          <EmptyState
            heading={t("floorPlan.list.emptyHeading")}
            description={t("floorPlan.list.emptyDescription")}
            action={
              <Button
                variant="primary"
                onClick={() => setShowNewDialog(true)}
                disabled={!selectedVenueId}
              >
                {t("floorPlan.list.createButton")}
              </Button>
            }
          />
        )}

        {!isLoading && !error && floorPlans.length > 0 && (
          <div className={styles.cardGrid}>
            {floorPlans.map((floorPlan) => (
              <article key={floorPlan.id} className={styles.card}>
                <Button
                  variant="ghost"
                  onClick={() => navigate(`/floor-plans/${floorPlan.id}`)}
                  className={styles.cardOpenButton}
                  type="button"
                  aria-label={t("floorPlan.list.openAria", { name: floorPlan.name })}
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
                          {t("floorPlan.list.active")}
                        </Badge>
                      )}
                    </div>
                    <div className={styles.cardDetails}>
                      <Text variant="caption" color="secondary">
                        {t("floorPlan.list.tableCount", { n: floorPlan.tables?.length ?? 0 })}
                      </Text>
                      <Text variant="caption" color="secondary">
                        {t("floorPlan.list.updated", { date: formatDate(floorPlan.updatedAt) })}
                      </Text>
                    </div>
                  </div>
                </Button>
                <div className={styles.cardActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleClone(floorPlan.id)}
                    aria-label={t("floorPlan.list.cloneAria", { name: floorPlan.name })}
                  >
                    {t("floorPlan.list.clone")}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
