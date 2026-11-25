import { useState, useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Stack, Text, Autocomplete, Select } from "@mattbutlerengineering/rialto";
import type { AutocompleteOption } from "@mattbutlerengineering/rialto";
import { OFFERED_CURRENCY_CODES, OFFERED_TIMEZONES, type OfferedTimezone } from "@mbe/types";
import { localeRuntime } from "../../i18n/runtime.js";
import { formatCurrencyName } from "../../utils/format.js";
import { FilledField } from "./FilledField";
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
  /** Fields the chat just filled; each is marked in the form. */
  filled?: readonly string[];
}

/** Display names for the offered IANA zones; the zone list itself is shared (`@mbe/types`). */
const TIMEZONE_LABELS: Readonly<Record<OfferedTimezone, string>> = {
  "America/New_York": "Eastern Time (America/New_York)",
  "America/Chicago": "Central Time (America/Chicago)",
  "America/Denver": "Mountain Time (America/Denver)",
  "America/Los_Angeles": "Pacific Time (America/Los_Angeles)",
  "America/Anchorage": "Alaska Time (America/Anchorage)",
  "Pacific/Honolulu": "Hawaii Time (Pacific/Honolulu)",
  "America/Phoenix": "Arizona (America/Phoenix)",
  "America/Toronto": "Eastern Time (America/Toronto)",
  "America/Vancouver": "Pacific Time (America/Vancouver)",
  "America/Edmonton": "Mountain Time (America/Edmonton)",
  "America/Winnipeg": "Central Time (America/Winnipeg)",
  "America/Halifax": "Atlantic Time (America/Halifax)",
  "America/St_Johns": "Newfoundland Time (America/St_Johns)",
  "America/Mexico_City": "Central Time (America/Mexico_City)",
  "America/Cancun": "Eastern Time (America/Cancun)",
  "America/Bogota": "Colombia Time (America/Bogota)",
  "America/Lima": "Peru Time (America/Lima)",
  "America/Santiago": "Chile Time (America/Santiago)",
  "America/Buenos_Aires": "Argentina Time (America/Buenos_Aires)",
  "America/Sao_Paulo": "Brasilia Time (America/Sao_Paulo)",
  "America/Caracas": "Venezuela Time (America/Caracas)",
  "Europe/London": "GMT / BST (Europe/London)",
  "Europe/Dublin": "GMT / IST (Europe/Dublin)",
  "Europe/Paris": "Central European (Europe/Paris)",
  "Europe/Berlin": "Central European (Europe/Berlin)",
  "Europe/Amsterdam": "Central European (Europe/Amsterdam)",
  "Europe/Brussels": "Central European (Europe/Brussels)",
  "Europe/Madrid": "Central European (Europe/Madrid)",
  "Europe/Rome": "Central European (Europe/Rome)",
  "Europe/Zurich": "Central European (Europe/Zurich)",
  "Europe/Vienna": "Central European (Europe/Vienna)",
  "Europe/Stockholm": "Central European (Europe/Stockholm)",
  "Europe/Warsaw": "Central European (Europe/Warsaw)",
  "Europe/Prague": "Central European (Europe/Prague)",
  "Europe/Athens": "Eastern European (Europe/Athens)",
  "Europe/Helsinki": "Eastern European (Europe/Helsinki)",
  "Europe/Bucharest": "Eastern European (Europe/Bucharest)",
  "Europe/Istanbul": "Turkey Time (Europe/Istanbul)",
  "Europe/Moscow": "Moscow Time (Europe/Moscow)",
  "Europe/Lisbon": "Western European (Europe/Lisbon)",
  "Asia/Dubai": "Gulf Standard Time (Asia/Dubai)",
  "Asia/Riyadh": "Arabian Standard Time (Asia/Riyadh)",
  "Asia/Qatar": "Arabian Standard Time (Asia/Qatar)",
  "Asia/Tehran": "Iran Standard Time (Asia/Tehran)",
  "Asia/Jerusalem": "Israel Standard Time (Asia/Jerusalem)",
  "Africa/Cairo": "Eastern European (Africa/Cairo)",
  "Africa/Johannesburg": "South Africa (Africa/Johannesburg)",
  "Africa/Lagos": "West Africa (Africa/Lagos)",
  "Africa/Nairobi": "East Africa (Africa/Nairobi)",
  "Africa/Casablanca": "Morocco (Africa/Casablanca)",
  "Asia/Kolkata": "India Standard Time (Asia/Kolkata)",
  "Asia/Karachi": "Pakistan Standard Time (Asia/Karachi)",
  "Asia/Dhaka": "Bangladesh Standard Time (Asia/Dhaka)",
  "Asia/Colombo": "Sri Lanka Time (Asia/Colombo)",
  "Asia/Kathmandu": "Nepal Time (Asia/Kathmandu)",
  "Asia/Bangkok": "Indochina Time (Asia/Bangkok)",
  "Asia/Ho_Chi_Minh": "Indochina Time (Asia/Ho_Chi_Minh)",
  "Asia/Jakarta": "Western Indonesia (Asia/Jakarta)",
  "Asia/Singapore": "Singapore Time (Asia/Singapore)",
  "Asia/Kuala_Lumpur": "Malaysia Time (Asia/Kuala_Lumpur)",
  "Asia/Manila": "Philippine Time (Asia/Manila)",
  "Asia/Shanghai": "China Standard Time (Asia/Shanghai)",
  "Asia/Hong_Kong": "Hong Kong Time (Asia/Hong_Kong)",
  "Asia/Taipei": "Taiwan Time (Asia/Taipei)",
  "Asia/Seoul": "Korea Standard Time (Asia/Seoul)",
  "Asia/Tokyo": "Japan Standard Time (Asia/Tokyo)",
  "Australia/Perth": "Australian Western (Australia/Perth)",
  "Australia/Adelaide": "Australian Central (Australia/Adelaide)",
  "Australia/Sydney": "Australian Eastern (Australia/Sydney)",
  "Australia/Melbourne": "Australian Eastern (Australia/Melbourne)",
  "Australia/Brisbane": "Australian Eastern no DST (Australia/Brisbane)",
  "Pacific/Auckland": "New Zealand Time (Pacific/Auckland)",
  "Pacific/Fiji": "Fiji Time (Pacific/Fiji)",
  "Pacific/Guam": "Chamorro Time (Pacific/Guam)",
};

const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = OFFERED_TIMEZONES.map(
  (value) => ({ value, label: TIMEZONE_LABELS[value] })
);

/** ISO 4217 codes offered in the currency picker (shared, `@mbe/types`); names come from the locale (`formatCurrencyName`). */
const CURRENCY_CODES = OFFERED_CURRENCY_CODES;

/** True when the form can show `value` as a time zone. A chat patch may only set these. */
export function isOfferedTimezone(value: string): boolean {
  return TIMEZONE_OPTIONS.some((option) => option.value === value);
}

/** True when the form can show `value` as a currency. A chat patch may only set these. */
export function isOfferedCurrency(value: string): boolean {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

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

/** Validate location & time step data. Pure. */
export function validateLocationTime(
  data: LocationTimeData,
  t: TFunction = localeRuntime.i18n.t
): Partial<Record<keyof LocationTimeData, string>> {
  const errors: Partial<Record<keyof LocationTimeData, string>> = {};

  if (!data.ianaTimezone) {
    errors.ianaTimezone = t("onboarding.locationTime.errors.timezoneRequired");
  }

  if (!data.currencyCode) {
    errors.currencyCode = t("onboarding.locationTime.errors.currencyRequired");
  }

  return errors;
}

export function LocationTimeStep({
  data,
  errors,
  onChange,
  onValidate,
  filled = [],
}: LocationTimeStepProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  // Track the text shown in the Autocomplete input
  const selectedTzLabel = TIMEZONE_OPTIONS.find((o) => o.value === data.ianaTimezone)?.label ?? "";
  const [tzSearch, setTzSearch] = useState(selectedTzLabel);
  // The box keeps the text being typed, but when the zone is set from outside (the chat) it must
  // show the new zone. Adjusting state while rendering avoids a remount, which would drop focus.
  const [shownZone, setShownZone] = useState(data.ianaTimezone);
  if (shownZone !== data.ianaTimezone) {
    setShownZone(data.ianaTimezone);
    if (data.ianaTimezone !== "") setTzSearch(selectedTzLabel);
  }

  const autocompleteOptions: AutocompleteOption[] = useMemo(
    () => TIMEZONE_OPTIONS.map((tz) => ({ value: tz.value, label: tz.label })),
    []
  );

  // Names via Intl.DisplayNames (through utils/format.ts) so they follow the active locale.
  const currencySelectOptions = useMemo(
    () =>
      CURRENCY_CODES.map((code) => ({
        value: code,
        label: t("onboarding.locationTime.currencyOption", {
          code,
          name: formatCurrencyName(code, locale),
        }),
      })),
    [t, locale]
  );

  return (
    <div className={styles.stepContainer}>
      <Stack gap="md">
        <FilledField
          filled={filled.includes("ianaTimezone")}
          label={t("onboarding.locationTime.timezoneLabel")}
        >
          <Autocomplete
            label={t("onboarding.locationTime.timezoneLabel")}
            placeholder={t("onboarding.locationTime.timezonePlaceholder")}
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
            emptyText={t("onboarding.locationTime.timezoneEmpty")}
          />
          {errors.ianaTimezone && <Text className={styles.errorText}>{errors.ianaTimezone}</Text>}
          <Text variant="caption" color="secondary">
            {t("onboarding.locationTime.timezoneHint")}
          </Text>
        </FilledField>

        <FilledField
          filled={filled.includes("currencyCode")}
          label={t("onboarding.locationTime.currencyLabel")}
        >
          <Select
            label={t("onboarding.locationTime.currencyLabel")}
            options={currencySelectOptions}
            value={data.currencyCode}
            onChange={(val) => {
              onChange({ ...data, currencyCode: val });
              onValidate?.();
            }}
            placeholder={t("onboarding.locationTime.currencyPlaceholder")}
          />
          {errors.currencyCode && <Text className={styles.errorText}>{errors.currencyCode}</Text>}
        </FilledField>
      </Stack>
    </div>
  );
}
