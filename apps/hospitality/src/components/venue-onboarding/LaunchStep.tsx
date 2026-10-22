import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text, Card, Button } from "@mattbutlerengineering/rialto";
import type { OperatingHours } from "@mbe/types";
import type { BasicInfoData } from "./BasicInfoStep.js";
import type { LocationTimeData } from "./LocationTimeStep.js";
import type { SettingsData } from "./SettingsStep.js";
import { EMPTY_FLOOR_PLAN_DRAFT, type FloorPlanDraft } from "./floor-plan-draft.js";
import { layoutForDraft, templateById } from "./floor-plan-templates.js";
import { layoutCounts } from "./floor-plan-copy.js";
import { TemplateMiniPreview } from "../floor-plan/TemplateMiniPreview.js";
import { INITIAL_LAUNCH_PROGRESS, type LaunchProgress } from "./launch-sequence.js";
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
  const { t } = useTranslation();
  const [celebrating, setCelebrating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  // Resets the flag on (re)mount and cancels a pending navigate if this step
  // unmounts (e.g. the user clicks Back) before the celebration timer fires,
  // marking the component gone so an in-flight launch never schedules a
  // stray navigate. The reset matters because React 18 StrictMode's
  // dev-only mount->unmount->remount simulation runs this cleanup once
  // immediately after the first mount without recreating the ref — without
  // resetting to false here, unmountedRef.current stayed permanently true
  // from that point on, so handleLaunch's guard below always bailed and the
  // celebration/navigate handoff never fired for the rest of the component's
  // life (#5017 — this is exactly what the dev-server-backed Hospitality E2E
  // suite exercises, unlike a production build where effects are not
  // double-invoked).
  useEffect(() => {
    unmountedRef.current = false;
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
        ? t("onboarding.launch.celebrationTables", { count: tableCount })
        : t("onboarding.launch.celebrationEmpty");

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
  const template = floorPlan.templateId !== null ? templateById(floorPlan.templateId) : null;
  // The draft as the operator left it — their own tables at their own
  // positions, on the room's canvas with its walls and zones. Projected from
  // the draft, never rebuilt from the template, so this picture agrees with the
  // table count rendered beside it and with what Launch is about to create.
  const reviewLayout = layoutForDraft(floorPlan);
  const tableCount = floorPlan.tables.length;
  const launchStarted =
    launch.inFlightStage !== null || launch.failedStage !== null || launch.venueId !== null;

  return (
    <div className={styles.stepContainer}>
      <Text variant="caption" color="secondary">
        {t("onboarding.launch.intro")}
      </Text>

      {launchStarted ? (
        <Text variant="caption" color="secondary">
          {t("onboarding.launch.launching", { name: basicInfo.name })}
        </Text>
      ) : (
        <Stack gap="md">
          <Card title={t("onboarding.launch.basicInfoCard")} variant="flat">
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>{t("onboarding.launch.name")}</Text>
              <Text className={styles.reviewValue}>{basicInfo.name}</Text>
            </div>
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>{t("onboarding.launch.slug")}</Text>
              <Text className={styles.reviewValue}>{basicInfo.slug}</Text>
            </div>
          </Card>

          <Card title={t("onboarding.locationTime.heading")} variant="flat">
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>{t("onboarding.launch.timezone")}</Text>
              <Text className={styles.reviewValue}>{locationTime.ianaTimezone}</Text>
            </div>
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>{t("onboarding.launch.currency")}</Text>
              <Text className={styles.reviewValue}>{locationTime.currencyCode}</Text>
            </div>
          </Card>

          <Card title={t("onboarding.hours.heading")} variant="flat">
            {hasOperatingHours ? (
              DAYS_OF_WEEK.map((day) => {
                const schedule = operatingHours[day];
                return (
                  <div key={day} className={styles.reviewSection}>
                    <Text className={styles.reviewLabel}>{t(`onboarding.days.${day}`)}</Text>
                    <Text className={styles.reviewValue}>
                      {schedule
                        ? `${schedule.open} - ${schedule.close}`
                        : t("onboarding.hours.closed")}
                    </Text>
                  </div>
                );
              })
            ) : (
              <Text variant="caption" color="secondary">
                {t("onboarding.launch.noHours")}
              </Text>
            )}
          </Card>

          <Card title={t("onboarding.launch.settingsCard")} variant="flat">
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>{t("onboarding.launch.defaultDuration")}</Text>
              <Text className={styles.reviewValue}>
                {t("onboarding.launch.minutes", {
                  count: Number(settings.defaultReservationDuration || "90"),
                })}
                {!settings.defaultReservationDuration && (
                  <Text variant="caption" color="secondary">
                    {" "}
                    {t("onboarding.launch.defaultTag")}
                  </Text>
                )}
              </Text>
            </div>
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>{t("onboarding.launch.maxPartySize")}</Text>
              <Text className={styles.reviewValue}>
                {t("onboarding.launch.guests", { count: Number(settings.maxPartySize || "12") })}
                {!settings.maxPartySize && (
                  <Text variant="caption" color="secondary">
                    {" "}
                    {t("onboarding.launch.defaultTag")}
                  </Text>
                )}
              </Text>
            </div>
            <div className={styles.reviewSection}>
              <Text className={styles.reviewLabel}>{t("onboarding.launch.advanceBooking")}</Text>
              <Text className={styles.reviewValue}>
                {t("onboarding.launch.days", {
                  count: Number(settings.advanceBookingDays || "30"),
                })}
                {!settings.advanceBookingDays && (
                  <Text variant="caption" color="secondary">
                    {" "}
                    {t("onboarding.launch.defaultTag")}
                  </Text>
                )}
              </Text>
            </div>
          </Card>

          {template && (
            <Card title={t("onboarding.launch.floorPlanCard")} variant="flat">
              <div className={styles.reviewSection}>
                <Text className={styles.reviewLabel}>{t("onboarding.launch.layout")}</Text>
                <Text className={styles.reviewValue}>
                  {t(`floorPlan.templates.items.${template.id}.name`)}
                </Text>
              </div>
              <div className={styles.reviewSection}>
                <Text className={styles.reviewLabel}>{t("onboarding.launch.name")}</Text>
                <Text className={styles.reviewValue}>{floorPlan.planName}</Text>
              </div>
              <div className={styles.reviewSection}>
                <Text className={styles.reviewLabel}>{t("onboarding.launch.tables")}</Text>
                <Text className={styles.reviewValue}>
                  {tableCount === 0
                    ? t("onboarding.launch.noTables")
                    : t("onboarding.floorPlan.summary", layoutCounts(t, floorPlan.tables))}
                </Text>
              </div>
              {reviewLayout && (
                <TemplateMiniPreview layout={reviewLayout} className={styles.templatePreview} />
              )}
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
            {t(
              launch.failedStage === "venue"
                ? "onboarding.launch.resumeNoVenue"
                : "onboarding.launch.resumeSaved",
              { stage: t(`onboarding.launch.stages.${launch.failedStage}`) }
            )}
          </Text>
          <ErrorRetryBanner error={launch.errorMessage ?? ""} onRetry={onRetry} />
        </>
      )}

      {launch.failedStage === null && (
        <Button variant="primary" onClick={handleLaunch} disabled={launchStarted}>
          {t("onboarding.launch.launchButton")}
        </Button>
      )}
    </div>
  );
}
