import { Text, Stack } from "@mbe/rialto";
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
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const currentSlugIsAuto = data.slug === generateSlug(data.name);
    const newSlug = currentSlugIsAuto || data.slug === "" ? generateSlug(value) : data.slug;
    onChange({ ...data, name: value, slug: newSlug });
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...data, slug: e.target.value });
  };

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...data, venueGroupId: e.target.value });
  };

  const slugHint =
    slugStatus === "checking"
      ? "Checking availability..."
      : slugStatus === "available"
        ? "Slug is available"
        : slugStatus === "taken"
          ? undefined // shown as error instead
          : "URL-friendly identifier (auto-generated from name)";

  const slugHintColor =
    slugStatus === "available" ? "primary" : "secondary";

  return (
    <div className={styles.stepContainer}>
      <Stack gap="md">
        <div className={styles.fieldGroup}>
          <label htmlFor="venue-name" className={styles.label}>
            Venue Name
          </label>
          <input
            id="venue-name"
            type="text"
            className={styles.select}
            placeholder="e.g. The Grand Ballroom"
            value={data.name}
            onChange={handleNameChange}
            onBlur={onValidate}
            aria-label="Venue Name"
          />
          {errors.name && <span className={styles.errorText}>{errors.name}</span>}
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="venue-slug" className={styles.label}>
            Slug
          </label>
          <input
            id="venue-slug"
            type="text"
            className={styles.select}
            placeholder="e.g. the-grand-ballroom"
            value={data.slug}
            onChange={handleSlugChange}
            onBlur={onValidate}
            aria-label="Slug"
          />
          {slugHint && (
            <Text variant="caption" color={slugHintColor}>
              {slugHint}
            </Text>
          )}
          {errors.slug && <span className={styles.errorText}>{errors.slug}</span>}
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="venue-group" className={styles.label}>
            Venue Group (optional)
          </label>
          <select
            id="venue-group"
            className={styles.select}
            value={data.venueGroupId}
            onChange={handleGroupChange}
          >
            <option value="">None</option>
          </select>
          <Text variant="caption" color="secondary">
            Assign this venue to an existing group
          </Text>
        </div>
      </Stack>
    </div>
  );
}
