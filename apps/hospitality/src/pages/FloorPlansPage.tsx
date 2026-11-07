import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Badge,
  Button,
  ConfirmDialog,
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
import {
  NewFloorPlanDialog,
  createFloorPlanFromTemplate,
  type NewFloorPlanRequest,
} from "../components/floor-plan";
import { useFloorPlans, useCloneFloorPlan, useDeleteFloorPlan } from "../hooks/useFloorPlans.js";
import { useApiClient } from "../hooks/useApiClient.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
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

/* ── Clone / delete failure ──────────────────── */

interface ActionFailure {
  title: string;
  detail: string;
  raw?: string;
}

function actionFailureFrom(err: unknown, title: string): ActionFailure {
  const description = describeApiError(err);
  return { title, detail: description.detail, raw: description.raw };
}

function cloneFailureFrom(err: unknown, t: TFunction): ActionFailure {
  return actionFailureFrom(err, t("floorPlan.list.cloneFailed"));
}

/* ── Main component ─────────────────────────── */

export function FloorPlansPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedVenueId, selectedVenue } = useVenue();
  const fmt = useVenueFormat({
    ianaTimezone: selectedVenue?.ianaTimezone ?? "UTC",
    currencyCode: selectedVenue?.currencyCode ?? "USD",
  });
  const api = useApiClient();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const [actionFailure, setActionFailure] = useState<ActionFailure | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FloorPlan | null>(null);

  const {
    data: floorPlans = [],
    isLoading,
    error,
    refetch,
  } = useFloorPlans({ venueId: selectedVenueId });
  const loadFailure = error ? describeApiError(error) : null;

  const cloneMutation = useCloneFloorPlan();
  const deleteMutation = useDeleteFloorPlan();

  // Blank creates the plan and stops; a template goes on to add its sections
  // and tables — all through the ordinary floor-plan, section and table routes.
  const handleCreate = useCallback(
    async (request: NewFloorPlanRequest) => createFloorPlanFromTemplate(api, request),
    [api]
  );

  const handleClone = useCallback(
    async (id: string) => {
      setActionFailure(null);
      try {
        const cloned = await cloneMutation.mutateAsync(id);
        setLiveMessage(t("floorPlan.list.cloned", { name: cloned.name }));
        navigate(`/floor-plans/${cloned.id}`);
      } catch (err) {
        setActionFailure(cloneFailureFrom(err, t));
      }
    },
    [cloneMutation, navigate, t]
  );

  const handleConfirmDelete = useCallback(async () => {
    const floorPlan = pendingDelete;
    // Invariant: the dialog is only open while a plan is pending.
    if (!floorPlan) return;
    setPendingDelete(null);
    setActionFailure(null);
    try {
      await deleteMutation.mutateAsync(floorPlan.id);
      setLiveMessage(t("floorPlan.list.deleted", { name: floorPlan.name }));
    } catch (err) {
      setActionFailure(actionFailureFrom(err, t("floorPlan.list.deleteFailed")));
    }
  }, [deleteMutation, pendingDelete, t]);

  const tableCountLabel = (floorPlan: FloorPlan) =>
    t("floorPlan.list.tableCount", { count: floorPlan.tables?.length ?? 0 });
  const updatedLabel = (floorPlan: FloorPlan) =>
    t("floorPlan.list.updated", { date: fmt.formatShortDate(floorPlan.updatedAt.slice(0, 10)) });

  const handleCreated = useCallback(
    (floorPlan: FloorPlan) => {
      navigate(`/floor-plans/${floorPlan.id}`);
    },
    [navigate]
  );

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

        <ConfirmDialog
          open={pendingDelete !== null}
          variant="destructive"
          title={t("floorPlan.list.deleteTitle", { name: pendingDelete?.name ?? "" })}
          description={t("floorPlan.list.deleteDescription")}
          confirmLabel={t("floorPlan.list.deleteConfirm")}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />

        {loadFailure && (
          <ErrorRetryBanner
            title={t("floorPlan.list.loadFailed")}
            error={loadFailure.detail}
            details={loadFailure.raw}
            onRetry={refetch}
            onDismiss={() => {}}
          />
        )}

        {actionFailure && (
          <ErrorRetryBanner
            title={actionFailure.title}
            error={actionFailure.detail}
            details={actionFailure.raw}
            onDismiss={() => setActionFailure(null)}
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
                      <Text
                        variant="body"
                        color="primary"
                        truncate
                        data-truncate
                        title={floorPlan.name}
                        className={styles.cardName}
                      >
                        {floorPlan.name}
                      </Text>
                      {floorPlan.isActive && (
                        <Badge variant="success" size="sm">
                          {t("floorPlan.list.active")}
                        </Badge>
                      )}
                    </div>
                    <div className={styles.cardDetails}>
                      <Text
                        variant="caption"
                        color="secondary"
                        truncate
                        data-truncate
                        title={tableCountLabel(floorPlan)}
                      >
                        {tableCountLabel(floorPlan)}
                      </Text>
                      <Text
                        variant="caption"
                        color="secondary"
                        truncate
                        data-truncate
                        title={updatedLabel(floorPlan)}
                      >
                        {updatedLabel(floorPlan)}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDelete(floorPlan)}
                    disabled={floorPlan.isActive}
                    aria-label={t("floorPlan.list.deleteAria", { name: floorPlan.name })}
                    aria-describedby={
                      floorPlan.isActive ? `delete-reason-${floorPlan.id}` : undefined
                    }
                    title={floorPlan.isActive ? t("floorPlan.list.deleteActiveReason") : undefined}
                  >
                    {t("floorPlan.list.delete")}
                  </Button>
                  {floorPlan.isActive && (
                    <Text id={`delete-reason-${floorPlan.id}`} className={styles.srOnly}>
                      {t("floorPlan.list.deleteActiveReason")}
                    </Text>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
