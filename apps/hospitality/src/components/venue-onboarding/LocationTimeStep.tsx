import { Stack, Text } from "@mbe/rialto";
import styles from "./venue-onboarding.module.css";

export interface LocationTimeData {
  ianaTimezone: string;
  currencyCode: string;
}

interface LocationTimeStepProps {
  data: LocationTimeData;
  errors: Partial<Record<keyof LocationTimeData, string>>;
  onChange: (data: LocationTimeData) => void;
  onValidate?: () => void;
}

export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (America/New_York)" },
  { value: "America/Chicago", label: "Central Time (America/Chicago)" },
  { value: "America/Denver", label: "Mountain Time (America/Denver)" },
  { value: "America/Los_Angeles", label: "Pacific Time (America/Los_Angeles)" },
  { value: "America/Anchorage", label: "Alaska Time (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Pacific/Honolulu)" },
  { value: "Europe/London", label: "GMT (Europe/London)" },
  { value: "Europe/Paris", label: "Central European Time (Europe/Paris)" },
  { value: "Europe/Berlin", label: "Central European Time (Europe/Berlin)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (Asia/Tokyo)" },
  { value: "Asia/Shanghai", label: "China Standard Time (Asia/Shanghai)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (Asia/Dubai)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (Australia/Sydney)" },
];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
  { value: "AUD", label: "AUD - Australian Dollar" },
  { value: "JPY", label: "JPY - Japanese Yen" },
  { value: "CHF", label: "CHF - Swiss Franc" },
  { value: "AED", label: "AED - UAE Dirham" },
];

export function LocationTimeStep({ data, errors, onChange, onValidate }: LocationTimeStepProps) {
  return (
    <div className={styles.stepContainer}>
      <Stack gap="md">
        <div className={styles.fieldGroup}>
          <label htmlFor="timezone" className={styles.label}>
            Timezone
          </label>
          <select
            id="timezone"
            className={styles.select}
            value={data.ianaTimezone}
            onChange={(e) => onChange({ ...data, ianaTimezone: e.target.value })}
            onBlur={onValidate}
          >
            <option value="">Select a timezone...</option>
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          {errors.ianaTimezone && (
            <span className={styles.errorText}>{errors.ianaTimezone}</span>
          )}
          <Text variant="caption" color="secondary">
            IANA timezone used for scheduling and availability
          </Text>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="currency" className={styles.label}>
            Currency
          </label>
          <select
            id="currency"
            className={styles.select}
            value={data.currencyCode}
            onChange={(e) => onChange({ ...data, currencyCode: e.target.value })}
            onBlur={onValidate}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {errors.currencyCode && (
            <span className={styles.errorText}>{errors.currencyCode}</span>
          )}
        </div>
      </Stack>
    </div>
  );
}
