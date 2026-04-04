import { Stack, Text } from "@mbe/rialto";
import styles from "./venue-onboarding.module.css";

export interface SettingsData {
  defaultReservationDuration: string;
  maxPartySize: string;
  advanceBookingDays: string;
}

interface SettingsStepProps {
  data: SettingsData;
  errors: Partial<Record<keyof SettingsData, string>>;
  onChange: (data: SettingsData) => void;
  onValidate?: () => void;
}

export function SettingsStep({ data, errors, onChange, onValidate }: SettingsStepProps) {
  return (
    <div className={styles.stepContainer}>
      <Text variant="caption" color="secondary">
        All settings are optional. You can configure them later.
      </Text>

      <Stack gap="md">
        <div className={styles.fieldGroup}>
          <label htmlFor="duration" className={styles.label}>
            Default Reservation Duration (minutes)
          </label>
          <input
            id="duration"
            type="number"
            className={styles.numberInput}
            value={data.defaultReservationDuration}
            onChange={(e) =>
              onChange({ ...data, defaultReservationDuration: e.target.value })
            }
            onBlur={onValidate}
            placeholder="90"
            min="1"
          />
          {errors.defaultReservationDuration && (
            <span className={styles.errorText}>{errors.defaultReservationDuration}</span>
          )}
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="maxParty" className={styles.label}>
            Maximum Party Size
          </label>
          <input
            id="maxParty"
            type="number"
            className={styles.numberInput}
            value={data.maxPartySize}
            onChange={(e) => onChange({ ...data, maxPartySize: e.target.value })}
            onBlur={onValidate}
            placeholder="12"
            min="1"
          />
          {errors.maxPartySize && (
            <span className={styles.errorText}>{errors.maxPartySize}</span>
          )}
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="advanceDays" className={styles.label}>
            Advance Booking Window (days)
          </label>
          <input
            id="advanceDays"
            type="number"
            className={styles.numberInput}
            value={data.advanceBookingDays}
            onChange={(e) =>
              onChange({ ...data, advanceBookingDays: e.target.value })
            }
            onBlur={onValidate}
            placeholder="30"
            min="1"
          />
          {errors.advanceBookingDays && (
            <span className={styles.errorText}>{errors.advanceBookingDays}</span>
          )}
          <Text variant="caption" color="secondary">
            How far in advance guests can book
          </Text>
        </div>
      </Stack>
    </div>
  );
}
