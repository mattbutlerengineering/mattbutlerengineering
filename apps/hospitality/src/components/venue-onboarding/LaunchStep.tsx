import { useRef, useState, useEffect } from "react";
import { Stack, Text, Card, Button } from "@mattbutlerengineering/rialto";
import type { OperatingHours } from "@mbe/types";
import type { BasicInfoData } from "./BasicInfoStep.js";
import type { LocationTimeData } from "./LocationTimeStep.js";
import type { SettingsData } from "./SettingsStep.js";
import { EMPTY_FLOOR_PLAN_DRAFT, type FloorPlanDraft } from "./floor-plan-draft.js";
import { templateById, type TemplateId } from "./floor-plan-templates.js";
import { TemplatePreview } from "./TemplatePreview.js";
import {
  INITIAL_LAUNCH_PROGRESS,
  type LaunchProgress,
  type LaunchStageId,
} from "./launch-sequence.js";
import { LaunchStagePanel } from "./LaunchStagePanel.js";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import styles from "./LaunchStep.module.css";

const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

// Full celebration is a short, deliberate pause; under prefers-reduced-motion
// we still show the success state (so it doesn't look like nothing happened)
// but skip the drawn-out animation timing.
const CELEBRATION_MS = 1300;
const REDUCED_MOTION_CELEBRATION_MS = 400;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Title Case stage label for the resume lead sentence (ux.md § Copy → Launch review card). */
const RESUME_STAGE_LABEL: Record<LaunchStageId, string> = {
  venue: "Venue",
  floorPlan: "Floor plan",
  tables: "Tables",
  activate: "Activate",
};

/**
 * "Your venue is saved. Retry picks up at {Stage}." — except a venue-stage
 * failure, where no venue exists yet, so the saved-venue sentence is dropped.
 */
function resumeLeadFor(failedStage: LaunchStageId): string {
  const stage = RESUME_STAGE_LABEL[failedStage];
  if (failedStage === "venue") return `Retry picks up at ${stage}.`;
  return `Your venue is saved. Retry picks up at ${stage}.`;
}

interface LaunchStepProps {
  basicInfo: BasicInfoData;
  locationTime: LocationTimeData;
  operatingHours: OperatingHours;
  settings: SettingsData;
  onLaunch: () => Promise<void>;
  onCelebrationDone: () => void;
  floorPlan?: FloorPlanDraft;
  launch?: LaunchProgress;
  onRetry?: () => void;
}

export function LaunchStep({
  basicInfo,
  locationTime,
  operatingHours,
  settings,
  onLaunch,
  onCelebrationDone,
  floorPlan = EMPTY_FLOOR_PLAN_DRAFT,
  launch = INITIAL_LAUNCH_PROGRESS,
  onRetry,
}: LaunchStepProps) {
  const [celebrating, setCelebrating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  // Cleanup only — cancels a pending navigate if this step unmounts (e.g. the
  // user clicks Back) before the celebration timer fires, and marks the
  // component gone so an in-flight launch never schedules a stray navigate.
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleLaunch = async () => {
    try {
      await onLaunch();
      if (unmountedRef.current) return;
      setCelebrating(true);
      const delay = prefersReducedMotion() ? REDUCED_MOTION_CELEBRATION_MS : CELEBRATION_MS;
      timeoutRef.current = setTimeout(onCelebrationDone, delay);
    } catch {
      // launch.failedStage/errorMessage already reflect the failure; nothing to celebrate.
    }
  };

  if (celebrating) {
    const tableCount = floorPlan.tables.length;
    const celebrationCopy =
      tableCount > 0
        ? `Your venue is live with ${tableCount} tables`
        : "Your venue is live — add tables next";

    return (
      <div className={styles.celebration} role="status" aria-live="polite">
        <div className={styles.iconWrapper}>
          <svg
            className={styles.icon}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              className={styles.checkPath}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <Text variant="label">{celebrationCopy}</Text>
      </div>
    );
  }

  const hasOperatingHours = Object.keys(operatingHours).length > 0;
  // FloorPlanDraft.templateId is a plain string (floor-plan-draft.ts can't
  // import TemplateId from floor-plan-templates.ts without a cycle) but is
  // only ever populated from a TemplateId — same cast FloorPlanStep.tsx's
  // sibling call sites rely on implicitly via a pre-typed variable.
  const template =
    floorPlan.templateId !== null ? templateById(floorPlan.templateId as TemplateId) : null;
  const tableCount = floorPlan.tables.length;
  const totalSeats = floorPlan.tables.reduce((sum, table) => sum + table.capacity, 0);
  const launchStarted =
    launch.inFlightStage !== null || launch.failedStage !== null || launch.venueId !== null;

  return (
    <div className={styles.stepContainer}>
      <Text variant="caption" color="secondary">
        Review your venue details — you&apos;re ready to take reservations.
      </Text>

      {launchStarted ? (
        <Text variant="caption" color="secondary">
          Launching &quot;{basicInfo.name}&quot;
        </Text>
      ) : (
        <Stack gap="md">
          <Card title="Basic Information" variant="flat">
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>Name</Text>
              <Text className={styles.reviewValue}>{basicInfo.name}</Text>
            </div>
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>Slug</Text>
              <Text className={styles.reviewValue}>{basicInfo.slug}</Text>
            </div>
          </Card>

          <Card title="Location & Time" variant="flat">
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>Timezone</Text>
              <Text className={styles.reviewValue}>{locationTime.ianaTimezone}</Text>
            </div>
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>Currency</Text>
              <Text className={styles.reviewValue}>{locationTime.currencyCode}</Text>
            </div>
          </Card>

          <Card title="Operating Hours" variant="flat">
            {hasOperatingHours ? (
              DAYS_OF_WEEK.map((day) => {
                const schedule = operatingHours[day];
                return (
                  <div key={day} className={styles.reviewSection}>
                    <Text className={styles.reviewLabel}>{day}</Text>
                    <Text className={styles.reviewValue}>
                      {schedule ? `${schedule.open} - ${schedule.close}` : "Closed"}
                    </Text>
                  </div>
                );
              })
            ) : (
              <Text variant="caption" color="secondary">
                No operating hours set
              </Text>
            )}
          </Card>

          <Card title="Settings" variant="flat">
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>Default Duration</Text>
              <Text className={styles.reviewValue}>
                {settings.defaultReservationDuration || "90"} minutes
                {!settings.defaultReservationDuration && (
                  <Text variant="caption" color="secondary">
                    {" "}
                    (default)
                  </Text>
                )}
              </Text>
            </div>
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>Max Party Size</Text>
              <Text className={styles.reviewValue}>
                {settings.maxPartySize || "12"} guests
                {!settings.maxPartySize && (
                  <Text variant="caption" color="secondary">
                    {" "}
                    (default)
                  </Text>
                )}
              </Text>
            </div>
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>Advance Booking</Text>
              <Text className={styles.reviewValue}>
                {settings.advanceBookingDays || "30"} days
                {!settings.advanceBookingDays && (
                  <Text variant="caption" color="secondary">
                    {" "}
                    (default)
                  </Text>
                )}
              </Text>
            </div>
          </Card>

          {template && (
            <Card title="Floor Plan" variant="flat">
              <div className={styles.reviewSection}>
                <Text className={styles.reviewLabel}>Layout</Text>
                <Text className={styles.reviewValue}>{template.name}</Text>
              </div>
              <div className={styles.reviewSection}>
                <Text className={styles.reviewLabel}>Name</Text>
                <Text className={styles.reviewValue}>{floorPlan.planName}</Text>
              </div>
              <div className={styles.reviewSection}>
                <Text className={styles.reviewLabel}>Tables</Text>
                <Text className={styles.reviewValue}>
                  {tableCount === 0
                    ? "No tables — your Timeline stays empty until you add some"
                    : `${tableCount} tables · ${totalSeats} seats`}
                </Text>
              </div>
              <TemplatePreview tables={floorPlan.tables} className={styles.templatePreview} />
            </Card>
          )}
        </Stack>
      )}

      {launchStarted && (
        <LaunchStagePanel progress={launch} draft={floorPlan} venueName={basicInfo.name} />
      )}

      {launch.failedStage !== null && onRetry && (
        <>
          <Text variant="caption" color="secondary">
            {resumeLeadFor(launch.failedStage)}
          </Text>
          <ErrorRetryBanner error={launch.errorMessage ?? ""} onRetry={onRetry} />
        </>
      )}

      {launch.failedStage === null && (
        <Button variant="primary" onClick={handleLaunch} disabled={launchStarted}>
          Launch Venue
        </Button>
      )}
    </div>
  );
}
