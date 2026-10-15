import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Stack, Text, Input, Button } from "@mattbutlerengineering/rialto";
import { localeRuntime } from "../../i18n/runtime.js";
import styles from "./venue-onboarding.module.css";

export interface SettingsData {
  defaultReservationDuration: string;
  maxPartySize: string;
  advanceBookingDays: string;
}

/** Default values used by the backend when no explicit value is set. */
const DEFAULTS = {
  defaultReservationDuration: 90,
  maxPartySize: 8,
  advanceBookingDays: 30,
} as const;

/**
 * Recommended settings for the "Use recommended settings" one-click action and
 * the wizard's initial pre-fill (see `INITIAL_SETTINGS` in useOnboardingWizard.ts).
 * Single source of truth — do not duplicate these values elsewhere.
 */
export const RECOMMENDED_SETTINGS: SettingsData = {
  defaultReservationDuration: "90",
  maxPartySize: "8",
  advanceBookingDays: "30",
};

interface SettingsStepProps {
  data: SettingsData;
  errors: Partial<Record<keyof SettingsData, string>>;
  onChange: (data: SettingsData) => void;
  onValidate?: () => void;
  /** Advances the wizard to the next step. Wired to the "Use recommended settings" action. */
  onAdvance: () => void;
}

/** Validate settings step data. All fields are optional; only rejects invalid non-blank values. */
export function validateSettings(
  data: SettingsData,
  t: TFunction = localeRuntime.i18n.t
): Partial<Record<keyof SettingsData, string>> {
  const errors: Partial<Record<keyof SettingsData, string>> = {};

  if (data.defaultReservationDuration !== "") {
    const val = Number(data.defaultReservationDuration);
    if (isNaN(val) || val <= 0) {
      errors.defaultReservationDuration = t("onboarding.settings.errors.durationInvalid");
    }
  }

  if (data.maxPartySize !== "") {
    const val = Number(data.maxPartySize);
    if (isNaN(val) || val <= 0) {
      errors.maxPartySize = t("onboarding.settings.errors.maxPartyInvalid");
    }
  }

  if (data.advanceBookingDays !== "") {
    const val = Number(data.advanceBookingDays);
    if (isNaN(val) || val <= 0) {
      errors.advanceBookingDays = t("onboarding.settings.errors.advanceInvalid");
    }
  }

  return errors;
}

export function SettingsStep({ data, errors, onChange, onValidate, onAdvance }: SettingsStepProps) {
  const { t } = useTranslation();
  const handleUseRecommended = () => {
    onChange(RECOMMENDED_SETTINGS);
    onAdvance();
  };

  return (
    <div className={styles.stepContainer}>
      <Text variant="caption" color="secondary">
        {t("onboarding.settings.stepIntro")}
      </Text>

      <Button variant="primary" onClick={handleUseRecommended}>
        {t("onboarding.settings.useRecommended")}
      </Button>

      <Stack gap="md">
        <Input
          label={t("onboarding.settings.durationLabel")}
          type="number"
          value={data.defaultReservationDuration}
          onChange={(e) => onChange({ ...data, defaultReservationDuration: e.target.value })}
          onBlur={onValidate}
          placeholder={t("onboarding.settings.defaultPlaceholder", {
            value: DEFAULTS.defaultReservationDuration,
          })}
          error={errors.defaultReservationDuration !== undefined}
          hint={
            errors.defaultReservationDuration ??
            t("onboarding.settings.durationHint", { value: DEFAULTS.defaultReservationDuration })
          }
          showOptional
        />

        <Input
          label={t("onboarding.settings.maxPartyLabel")}
          type="number"
          value={data.maxPartySize}
          onChange={(e) => onChange({ ...data, maxPartySize: e.target.value })}
          onBlur={onValidate}
          placeholder={t("onboarding.settings.defaultPlaceholder", {
            value: DEFAULTS.maxPartySize,
          })}
          error={errors.maxPartySize !== undefined}
          hint={
            errors.maxPartySize ??
            t("onboarding.settings.maxPartyHint", { value: DEFAULTS.maxPartySize })
          }
          showOptional
        />

        <Input
          label={t("onboarding.settings.advanceLabel")}
          type="number"
          value={data.advanceBookingDays}
          onChange={(e) => onChange({ ...data, advanceBookingDays: e.target.value })}
          onBlur={onValidate}
          placeholder={t("onboarding.settings.defaultPlaceholder", {
            value: DEFAULTS.advanceBookingDays,
          })}
          error={errors.advanceBookingDays !== undefined}
          hint={
            errors.advanceBookingDays ??
            t("onboarding.settings.advanceHint", { value: DEFAULTS.advanceBookingDays })
          }
          showOptional
        />
      </Stack>
    </div>
  );
}
