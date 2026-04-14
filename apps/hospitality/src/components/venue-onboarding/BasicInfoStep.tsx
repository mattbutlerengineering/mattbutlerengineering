import { Stack, Input } from "@mattbutlerengineering/rialto";
import { generateSlug } from "./generate-slug.js";
import styles from "./venue-onboarding.module.css";

export interface BasicInfoData {
  name: string;
  slug: string;
  venueGroupId: string;
}

interface BasicInfoStepProps {
  data: BasicInfoData;
  errors: Partial<Record<keyof BasicInfoData, string>>;
  onChange: (data: BasicInfoData) => void;
  onValidate?: () => void;
  slugStatus?: "idle" | "checking" | "available" | "taken";
}

export function BasicInfoStep({ data, errors, onChange, onValidate, slugStatus }: BasicInfoStepProps) {
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
          required
        />

        <Input
          label="Slug"
          placeholder="e.g. the-grand-ballroom"
          value={data.slug}
          onChange={(e) => handleSlugChange(e.target.value)}
          onBlur={onValidate}
          error={slugError}
          hint={slugError ? errors.slug : slugHint}
          required
        />
      </Stack>
    </div>
  );
}
