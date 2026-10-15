import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Stack, Input } from "@mattbutlerengineering/rialto";
import { localeRuntime } from "../../i18n/runtime.js";
import { generateSlug } from "./generate-slug.js";
import styles from "./venue-onboarding.module.css";

export interface BasicInfoData {
  name: string;
  slug: string;
  venueGroupId: string;
}

/** Status of the debounced slug-uniqueness check performed while the user types. */
export type SlugStatus = "idle" | "checking" | "available" | "taken";

interface BasicInfoStepProps {
  data: BasicInfoData;
  errors: Partial<Record<keyof BasicInfoData, string>>;
  onChange: (data: BasicInfoData) => void;
  onValidate?: () => void;
  slugStatus?: SlugStatus;
}

/** Validate slug is URL-safe: lowercase alphanumeric and hyphens only. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Validate basic info step data. Pure — takes the current slug-check result as input. Messages
 * come from the active locale (callers inside React may pass their own `t`).
 */
export function validateBasicInfo(
  data: BasicInfoData,
  slugStatus: SlugStatus,
  t: TFunction = localeRuntime.i18n.t
): Partial<Record<keyof BasicInfoData, string>> {
  const errors: Partial<Record<keyof BasicInfoData, string>> = {};

  if (data.name.trim().length < 2) {
    errors.name = t("onboarding.basicInfo.errors.nameTooShort");
  }

  const slug = data.slug.trim();
  if (!slug) {
    errors.slug = t("onboarding.basicInfo.errors.slugRequired");
  } else if (!isValidSlug(slug)) {
    errors.slug = t("onboarding.basicInfo.errors.slugInvalid");
  } else if (slugStatus === "taken") {
    errors.slug = t("onboarding.basicInfo.errors.slugTaken");
  }

  return errors;
}

export function BasicInfoStep({
  data,
  errors,
  onChange,
  onValidate,
  slugStatus,
}: BasicInfoStepProps) {
  const { t } = useTranslation();
  const handleNameChange = (value: string) => {
    const currentSlugIsAuto = data.slug === generateSlug(data.name);
    const newSlug = currentSlugIsAuto || data.slug === "" ? generateSlug(value) : data.slug;
    onChange({ ...data, name: value, slug: newSlug });
  };

  const handleSlugChange = (value: string) => {
    onChange({ ...data, slug: value });
  };

  const slugHint =
    slugStatus === "checking"
      ? t("onboarding.basicInfo.slugChecking")
      : slugStatus === "available"
        ? t("onboarding.basicInfo.slugAvailable")
        : slugStatus === "taken"
          ? undefined // shown as error instead
          : t("onboarding.basicInfo.slugHint");

  const slugError = errors.slug !== undefined;

  return (
    <div className={styles.stepContainer}>
      <Stack gap="md">
        <Input
          label={t("onboarding.basicInfo.nameLabel")}
          placeholder={t("onboarding.basicInfo.namePlaceholder")}
          value={data.name}
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={onValidate}
          error={errors.name !== undefined}
          hint={errors.name}
        />

        <Input
          label={t("onboarding.basicInfo.slugLabel")}
          placeholder={t("onboarding.basicInfo.slugPlaceholder")}
          value={data.slug}
          onChange={(e) => handleSlugChange(e.target.value)}
          onBlur={onValidate}
          error={slugError}
          hint={slugError ? errors.slug : slugHint}
        />
      </Stack>
    </div>
  );
}
