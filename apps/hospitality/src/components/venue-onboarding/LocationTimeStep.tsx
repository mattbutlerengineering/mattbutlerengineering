import { useState, useMemo } from "react";
import { Stack, Text, Autocomplete, Select } from "@mattbutlerengineering/rialto";
import type { AutocompleteOption } from "@mattbutlerengineering/rialto";
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

/** Comprehensive list of IANA timezones (50+), grouped by region. */
export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  // Americas
  { value: "America/New_York", label: "Eastern Time (America/New_York)" },
  { value: "America/Chicago", label: "Central Time (America/Chicago)" },
  { value: "America/Denver", label: "Mountain Time (America/Denver)" },
  { value: "America/Los_Angeles", label: "Pacific Time (America/Los_Angeles)" },
  { value: "America/Anchorage", label: "Alaska Time (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Pacific/Honolulu)" },
  { value: "America/Phoenix", label: "Arizona (America/Phoenix)" },
  { value: "America/Toronto", label: "Eastern Time (America/Toronto)" },
  { value: "America/Vancouver", label: "Pacific Time (America/Vancouver)" },
  { value: "America/Edmonton", label: "Mountain Time (America/Edmonton)" },
  { value: "America/Winnipeg", label: "Central Time (America/Winnipeg)" },
  { value: "America/Halifax", label: "Atlantic Time (America/Halifax)" },
  { value: "America/St_Johns", label: "Newfoundland Time (America/St_Johns)" },
  { value: "America/Mexico_City", label: "Central Time (America/Mexico_City)" },
  { value: "America/Cancun", label: "Eastern Time (America/Cancun)" },
  { value: "America/Bogota", label: "Colombia Time (America/Bogota)" },
  { value: "America/Lima", label: "Peru Time (America/Lima)" },
  { value: "America/Santiago", label: "Chile Time (America/Santiago)" },
  { value: "America/Buenos_Aires", label: "Argentina Time (America/Buenos_Aires)" },
  { value: "America/Sao_Paulo", label: "Brasilia Time (America/Sao_Paulo)" },
  { value: "America/Caracas", label: "Venezuela Time (America/Caracas)" },
  // Europe
  { value: "Europe/London", label: "GMT / BST (Europe/London)" },
  { value: "Europe/Dublin", label: "GMT / IST (Europe/Dublin)" },
  { value: "Europe/Paris", label: "Central European (Europe/Paris)" },
  { value: "Europe/Berlin", label: "Central European (Europe/Berlin)" },
  { value: "Europe/Amsterdam", label: "Central European (Europe/Amsterdam)" },
  { value: "Europe/Brussels", label: "Central European (Europe/Brussels)" },
  { value: "Europe/Madrid", label: "Central European (Europe/Madrid)" },
  { value: "Europe/Rome", label: "Central European (Europe/Rome)" },
  { value: "Europe/Zurich", label: "Central European (Europe/Zurich)" },
  { value: "Europe/Vienna", label: "Central European (Europe/Vienna)" },
  { value: "Europe/Stockholm", label: "Central European (Europe/Stockholm)" },
  { value: "Europe/Warsaw", label: "Central European (Europe/Warsaw)" },
  { value: "Europe/Prague", label: "Central European (Europe/Prague)" },
  { value: "Europe/Athens", label: "Eastern European (Europe/Athens)" },
  { value: "Europe/Helsinki", label: "Eastern European (Europe/Helsinki)" },
  { value: "Europe/Bucharest", label: "Eastern European (Europe/Bucharest)" },
  { value: "Europe/Istanbul", label: "Turkey Time (Europe/Istanbul)" },
  { value: "Europe/Moscow", label: "Moscow Time (Europe/Moscow)" },
  { value: "Europe/Lisbon", label: "Western European (Europe/Lisbon)" },
  // Middle East & Africa
  { value: "Asia/Dubai", label: "Gulf Standard Time (Asia/Dubai)" },
  { value: "Asia/Riyadh", label: "Arabian Standard Time (Asia/Riyadh)" },
  { value: "Asia/Qatar", label: "Arabian Standard Time (Asia/Qatar)" },
  { value: "Asia/Tehran", label: "Iran Standard Time (Asia/Tehran)" },
  { value: "Asia/Jerusalem", label: "Israel Standard Time (Asia/Jerusalem)" },
  { value: "Africa/Cairo", label: "Eastern European (Africa/Cairo)" },
  { value: "Africa/Johannesburg", label: "South Africa (Africa/Johannesburg)" },
  { value: "Africa/Lagos", label: "West Africa (Africa/Lagos)" },
  { value: "Africa/Nairobi", label: "East Africa (Africa/Nairobi)" },
  { value: "Africa/Casablanca", label: "Morocco (Africa/Casablanca)" },
  // Asia & Oceania
  { value: "Asia/Kolkata", label: "India Standard Time (Asia/Kolkata)" },
  { value: "Asia/Karachi", label: "Pakistan Standard Time (Asia/Karachi)" },
  { value: "Asia/Dhaka", label: "Bangladesh Standard Time (Asia/Dhaka)" },
  { value: "Asia/Colombo", label: "Sri Lanka Time (Asia/Colombo)" },
  { value: "Asia/Kathmandu", label: "Nepal Time (Asia/Kathmandu)" },
  { value: "Asia/Bangkok", label: "Indochina Time (Asia/Bangkok)" },
  { value: "Asia/Ho_Chi_Minh", label: "Indochina Time (Asia/Ho_Chi_Minh)" },
  { value: "Asia/Jakarta", label: "Western Indonesia (Asia/Jakarta)" },
  { value: "Asia/Singapore", label: "Singapore Time (Asia/Singapore)" },
  { value: "Asia/Kuala_Lumpur", label: "Malaysia Time (Asia/Kuala_Lumpur)" },
  { value: "Asia/Manila", label: "Philippine Time (Asia/Manila)" },
  { value: "Asia/Shanghai", label: "China Standard Time (Asia/Shanghai)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time (Asia/Hong_Kong)" },
  { value: "Asia/Taipei", label: "Taiwan Time (Asia/Taipei)" },
  { value: "Asia/Seoul", label: "Korea Standard Time (Asia/Seoul)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (Asia/Tokyo)" },
  { value: "Australia/Perth", label: "Australian Western (Australia/Perth)" },
  { value: "Australia/Adelaide", label: "Australian Central (Australia/Adelaide)" },
  { value: "Australia/Sydney", label: "Australian Eastern (Australia/Sydney)" },
  { value: "Australia/Melbourne", label: "Australian Eastern (Australia/Melbourne)" },
  { value: "Australia/Brisbane", label: "Australian Eastern no DST (Australia/Brisbane)" },
  { value: "Pacific/Auckland", label: "New Zealand Time (Pacific/Auckland)" },
  { value: "Pacific/Fiji", label: "Fiji Time (Pacific/Fiji)" },
  { value: "Pacific/Guam", label: "Chamorro Time (Pacific/Guam)" },
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
  { value: "SGD", label: "SGD - Singapore Dollar" },
  { value: "INR", label: "INR - Indian Rupee" },
  { value: "BRL", label: "BRL - Brazilian Real" },
  { value: "MXN", label: "MXN - Mexican Peso" },
  { value: "NZD", label: "NZD - New Zealand Dollar" },
  { value: "ZAR", label: "ZAR - South African Rand" },
  { value: "KRW", label: "KRW - South Korean Won" },
  { value: "HKD", label: "HKD - Hong Kong Dollar" },
];

/** Try to detect the user's IANA timezone from the browser. */
export function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isSupported = TIMEZONE_OPTIONS.some((o) => o.value === tz);
    return isSupported ? tz : "";
  } catch {
    return "";
  }
}

export function LocationTimeStep({ data, errors, onChange, onValidate }: LocationTimeStepProps) {
  // Track the text shown in the Autocomplete input
  const selectedTzLabel = TIMEZONE_OPTIONS.find((o) => o.value === data.ianaTimezone)?.label ?? "";
  const [tzSearch, setTzSearch] = useState(selectedTzLabel);

  const autocompleteOptions: AutocompleteOption[] = useMemo(
    () => TIMEZONE_OPTIONS.map((tz) => ({ value: tz.value, label: tz.label })),
    []
  );

  const currencySelectOptions = useMemo(
    () => CURRENCY_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
    []
  );

  return (
    <div className={styles.stepContainer}>
      <Stack gap="md">
        <div className={styles.fieldGroup}>
          <Autocomplete
            label="Timezone"
            placeholder="Search timezones..."
            options={autocompleteOptions}
            value={tzSearch}
            onChange={(val) => {
              setTzSearch(val);
              // If the user clears the field, clear the selection
              if (val === "") {
                onChange({ ...data, ianaTimezone: "" });
              }
            }}
            onSelect={(option) => {
              setTzSearch(option.label);
              onChange({ ...data, ianaTimezone: option.value });
              onValidate?.();
            }}
            emptyText="No matching timezones"
            required
          />
          {errors.ianaTimezone && <span className={styles.errorText}>{errors.ianaTimezone}</span>}
          <Text variant="caption" color="secondary">
            IANA timezone used for scheduling and availability
          </Text>
        </div>

        <div className={styles.fieldGroup}>
          <Select
            label="Currency"
            options={currencySelectOptions}
            value={data.currencyCode}
            onChange={(val) => {
              onChange({ ...data, currencyCode: val });
              onValidate?.();
            }}
            placeholder="Select a currency..."
          />
          {errors.currencyCode && <span className={styles.errorText}>{errors.currencyCode}</span>}
        </div>
      </Stack>
    </div>
  );
}
