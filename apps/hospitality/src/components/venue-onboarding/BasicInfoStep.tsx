import { Stack, Input } from "@mattbutlerengineering/rialto";
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

/** Validate basic info step data. Pure — takes the current slug-check result as input. */
export function validateBasicInfo(
  data: BasicInfoData,
  slugStatus: SlugStatus
): Partial<Record<keyof BasicInfoData, string>> {
  const errors: Partial<Record<keyof BasicInfoData, string>> = {};

  if (data.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters";
  }

  const slug = data.slug.trim();
  if (!slug) {
    errors.slug = "Slug is required";
  } else if (!isValidSlug(slug)) {
    errors.slug = "Slug must be URL-safe (lowercase letters, numbers, hyphens)";
  } else if (slugStatus === "taken") {
    errors.slug = "A venue with this slug already exists";
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
      ? "Checking availability..."
      : slugStatus === "available"
        ? "Slug is available"
        : slugStatus === "taken"
          ? undefined // shown as error instead
          : "URL-friendly identifier (auto-generated from name)";

  const slugError = errors.slug !== undefined;

  return (
    <div className={styles.stepContainer}>
      <Stack gap="md">
        <Input
          label="Venue Name"
          placeholder="e.g. The Grand Ballroom"
          value={data.name}
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={onValidate}
          error={errors.name !== undefined}
          hint={errors.name}
        />

        <Input
          label="Slug"
          placeholder="e.g. the-grand-ballroom"
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
