import { useRef, useState, useEffect } from "react";
import { Stack, Text, Card, Button } from "@mattbutlerengineering/rialto";
import type { OperatingHours } from "@mbe/types";
import type { BasicInfoData } from "./BasicInfoStep.js";
import type { LocationTimeData } from "./LocationTimeStep.js";
import type { SettingsData } from "./SettingsStep.js";
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
  isSubmitting: boolean;
  submitError: string | null;
  onLaunch: () => Promise<void>;
  onCelebrationDone: () => void;
}

export function LaunchStep({
  basicInfo,
  locationTime,
  operatingHours,
  settings,
  isSubmitting,
  submitError,
  onLaunch,
  onCelebrationDone,
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
      // submitError is already populated by the wizard state; nothing to celebrate.
    }
  };

  if (celebrating) {
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
        <Text variant="label">You&apos;re ready to take reservations</Text>
      </div>
    );
  }

  const hasOperatingHours = Object.keys(operatingHours).length > 0;

  return (
    <div className={styles.stepContainer}>
      <Text variant="caption" color="secondary">
        Review your venue details — you&apos;re ready to take reservations.
      </Text>

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
      </Stack>

      {submitError && (
        <div className={styles.errorBanner} role="alert">
          <Text variant="body" color="error">
            {submitError}
          </Text>
        </div>
      )}

      <Button variant="primary" onClick={handleLaunch} disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Launch Venue"}
      </Button>
    </div>
  );
}
