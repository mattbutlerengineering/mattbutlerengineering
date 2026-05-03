import { Stack, Text, Input } from "@mattbutlerengineering/rialto";
import styles from "./venue-onboarding.module.css";

export interface SettingsData {
  defaultReservationDuration: string;
  maxPartySize: string;
  advanceBookingDays: string;
}

/** Default values used by the backend when no explicit value is set. */
const DEFAULTS = {
  defaultReservationDuration: 90,
  maxPartySize: 12,
  advanceBookingDays: 30,
} as const;

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
        All settings are optional. Leave blank to use the defaults shown.
      </Text>

      <Stack gap="md">
        <Input
          label="Default Reservation Duration (minutes)"
          type="number"
          value={data.defaultReservationDuration}
          onChange={(e) => onChange({ ...data, defaultReservationDuration: e.target.value })}
          onBlur={onValidate}
          placeholder={`Default: ${DEFAULTS.defaultReservationDuration}`}
          error={errors.defaultReservationDuration !== undefined}
          hint={
            errors.defaultReservationDuration ??
            `If left blank, defaults to ${DEFAULTS.defaultReservationDuration} minutes`
          }
          showOptional
        />

        <Input
          label="Maximum Party Size"
          type="number"
          value={data.maxPartySize}
          onChange={(e) => onChange({ ...data, maxPartySize: e.target.value })}
          onBlur={onValidate}
          placeholder={`Default: ${DEFAULTS.maxPartySize}`}
          error={errors.maxPartySize !== undefined}
          hint={errors.maxPartySize ?? `If left blank, defaults to ${DEFAULTS.maxPartySize} guests`}
          showOptional
        />

        <Input
          label="Advance Booking Window (days)"
          type="number"
          value={data.advanceBookingDays}
          onChange={(e) => onChange({ ...data, advanceBookingDays: e.target.value })}
          onBlur={onValidate}
          placeholder={`Default: ${DEFAULTS.advanceBookingDays}`}
          error={errors.advanceBookingDays !== undefined}
          hint={
            errors.advanceBookingDays ??
            `If left blank, guests can book up to ${DEFAULTS.advanceBookingDays} days ahead`
          }
          showOptional
        />
      </Stack>
    </div>
  );
}
