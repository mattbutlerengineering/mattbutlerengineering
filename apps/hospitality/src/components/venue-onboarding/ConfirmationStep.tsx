import { Stack, Text, Card } from "@mattbutlerengineering/rialto";
import type { OperatingHours } from "@mbe/types";
import type { BasicInfoData } from "./BasicInfoStep.js";
import type { LocationTimeData } from "./LocationTimeStep.js";
import type { SettingsData } from "./SettingsStep.js";
import styles from "./venue-onboarding.module.css";

const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

interface ConfirmationStepProps {
  basicInfo: BasicInfoData;
  locationTime: LocationTimeData;
  operatingHours: OperatingHours;
  settings: SettingsData;
}

export function ConfirmationStep({
  basicInfo,
  locationTime,
  operatingHours,
  settings,
}: ConfirmationStepProps) {
  const hasOperatingHours = Object.keys(operatingHours).length > 0;

  return (
    <div className={styles.stepContainer}>
      <Text variant="caption" color="secondary">
        Review your venue details before creating.
      </Text>

      <Stack gap="md">
        <Card title="Basic Information" variant="flat">
          <div className={styles.reviewSection}>
            <span className={styles.reviewLabel}>Name</span>
            <span className={styles.reviewValue}>{basicInfo.name}</span>
          </div>
          <div className={styles.reviewSection}>
            <span className={styles.reviewLabel}>Slug</span>
            <span className={styles.reviewValue}>{basicInfo.slug}</span>
          </div>
          {/* Venue group hidden — feature not yet available */}
        </Card>

        <Card title="Location & Time" variant="flat">
          <div className={styles.reviewSection}>
            <span className={styles.reviewLabel}>Timezone</span>
            <span className={styles.reviewValue}>{locationTime.ianaTimezone}</span>
          </div>
          <div className={styles.reviewSection}>
            <span className={styles.reviewLabel}>Currency</span>
            <span className={styles.reviewValue}>{locationTime.currencyCode}</span>
          </div>
        </Card>

        <Card title="Operating Hours" variant="flat">
          {hasOperatingHours ? (
            DAYS_OF_WEEK.map((day) => {
              const schedule = operatingHours[day];
              return (
                <div key={day} className={styles.reviewSection}>
                  <span className={styles.reviewLabel}>{day}</span>
                  <span className={styles.reviewValue}>
                    {schedule ? `${schedule.open} - ${schedule.close}` : "Closed"}
                  </span>
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
            <span className={styles.reviewLabel}>Default Duration</span>
            <span className={styles.reviewValue}>
              {settings.defaultReservationDuration || "90"} minutes
              {!settings.defaultReservationDuration && (
                <Text variant="caption" color="secondary">
                  {" "}
                  (default)
                </Text>
              )}
            </span>
          </div>
          <div className={styles.reviewSection}>
            <span className={styles.reviewLabel}>Max Party Size</span>
            <span className={styles.reviewValue}>
              {settings.maxPartySize || "12"} guests
              {!settings.maxPartySize && (
                <Text variant="caption" color="secondary">
                  {" "}
                  (default)
                </Text>
              )}
            </span>
          </div>
          <div className={styles.reviewSection}>
            <span className={styles.reviewLabel}>Advance Booking</span>
            <span className={styles.reviewValue}>
              {settings.advanceBookingDays || "30"} days
              {!settings.advanceBookingDays && (
                <Text variant="caption" color="secondary">
                  {" "}
                  (default)
                </Text>
              )}
            </span>
          </div>
        </Card>
      </Stack>
    </div>
  );
}
