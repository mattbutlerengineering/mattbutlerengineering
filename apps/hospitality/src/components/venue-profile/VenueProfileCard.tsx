import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  Stack,
  Text,
  TextArea,
} from "@mattbutlerengineering/rialto";
import type { VenueSettings } from "@mbe/types";
import { VENUE_DESCRIPTION_MAX_LENGTH } from "@mbe/types/schemas";
import { useVenue } from "../../contexts/VenueContext.js";
import { useUpdateVenue } from "../../hooks/useVenues.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import {
  parseVenueProfileForm,
  toVenueProfileForm,
  type VenueProfileFieldError,
  type VenueProfileForm,
  type VenueProfileFormErrors,
} from "./venue-profile-form.js";

/* ── Constants ──────────────────────────────── */

const typeOptions = (t: TFunction) => [
  { value: "", label: t("settings.profile.typeUnset") },
  { value: "fine_dining", label: t("settings.profile.typeFineDining") },
  { value: "casual", label: t("settings.profile.typeCasual") },
  { value: "bar", label: t("settings.profile.typeBar") },
  { value: "cafe", label: t("settings.profile.typeCafe") },
];

// `as const` keeps the literal key types i18next's `t` requires.
const ERROR_KEYS = {
  required: "settings.profile.errorRequired",
  invalid: "settings.profile.errorInvalid",
  tooLong: "settings.profile.errorTooLong",
} as const satisfies Record<VenueProfileFieldError, string>;

type SavePhase = "idle" | "saving" | "saved" | "invalid" | "failed";

/* ── Helpers ────────────────────────────────── */

/**
 * Rebuilds `settings` with the new profile, leaving every other operational
 * key untouched. The profile key is dropped entirely when the operator
 * cleared every field, so an empty object never lands in the row.
 */
function withProfile(
  settings: VenueSettings | null,
  profile: VenueSettings["profile"]
): VenueSettings {
  const { profile: _replaced, ...rest } = settings ?? {};
  return Object.keys(profile ?? {}).length > 0 ? { ...rest, profile } : { ...rest };
}

/* ── Fields ─────────────────────────────────── */

interface FieldsProps {
  readonly form: VenueProfileForm;
  readonly errors: VenueProfileFormErrors;
  readonly disabled: boolean;
  readonly onChange: (field: keyof VenueProfileForm, value: string) => void;
}

interface ProfileInputProps extends FieldsProps {
  readonly field: keyof VenueProfileForm;
  readonly label: string;
  readonly hint?: string;
}

/** One text field. Its error message replaces its hint while it is set. */
function ProfileInput({ form, errors, disabled, onChange, field, label, hint }: ProfileInputProps) {
  const { t } = useTranslation();
  const code = errors[field];

  return (
    <Input
      label={label}
      hint={code ? t(ERROR_KEYS[code]) : hint}
      error={Boolean(code)}
      value={form[field]}
      onChange={(event) => onChange(field, event.target.value)}
      disabled={disabled}
    />
  );
}

function AddressFields(props: FieldsProps) {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Text variant="caption" color="secondary">
        {t("settings.profile.addressHint")}
      </Text>
      <ProfileInput {...props} field="line1" label={t("settings.profile.line1")} />
      <ProfileInput {...props} field="line2" label={t("settings.profile.line2")} />
      <ProfileInput {...props} field="city" label={t("settings.profile.city")} />
      <ProfileInput {...props} field="region" label={t("settings.profile.region")} />
      <ProfileInput {...props} field="postalCode" label={t("settings.profile.postalCode")} />
      <ProfileInput
        {...props}
        field="country"
        label={t("settings.profile.country")}
        hint={t("settings.profile.countryHint")}
      />
    </Stack>
  );
}

/* ── Main component ─────────────────────────── */

/**
 * Operator editor for `Venue.settings.profile` — venue type, cuisines, postal
 * address, website and description (#7250). Saves through the existing
 * `useUpdateVenue` mutation; `parseVenueProfileForm` validates against the
 * very schema the service enforces at the HTTP boundary, so a bad value is
 * caught here rather than coming back as a 400.
 */
export function VenueProfileCard() {
  const { t } = useTranslation();
  const { selectedVenue, selectedVenueId } = useVenue();
  const updateVenueMutation = useUpdateVenue();

  const [form, setForm] = useState<VenueProfileForm>(() =>
    toVenueProfileForm(selectedVenue?.settings?.profile)
  );
  const [errors, setErrors] = useState<VenueProfileFormErrors>({});
  const [phase, setPhase] = useState<SavePhase>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-seed during render when the venue switches while this card stays
  // mounted — React's documented reset-on-prop-change pattern, and the one
  // rialto's rendering model allows (never setState inside an effect body).
  const [seededVenueId, setSeededVenueId] = useState(selectedVenueId);
  if (selectedVenueId !== seededVenueId) {
    setSeededVenueId(selectedVenueId);
    setForm(toVenueProfileForm(selectedVenue?.settings?.profile));
    setErrors({});
    setPhase("idle");
    setSaveError(null);
  }

  const handleChange = (field: keyof VenueProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setPhase("idle");
  };

  const handleSave = async () => {
    if (!selectedVenueId) return;

    const result = parseVenueProfileForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      setPhase("invalid");
      return;
    }

    setErrors({});
    setPhase("saving");
    setSaveError(null);
    try {
      await updateVenueMutation.mutateAsync({
        venueId: selectedVenueId,
        data: { settings: withProfile(selectedVenue?.settings ?? null, result.profile) },
      });
      setPhase("saved");
    } catch (err) {
      setSaveError(describeApiError(err).detail);
      setPhase("failed");
    }
  };

  if (!selectedVenueId) {
    return (
      <Card title={t("settings.profile.title")}>
        <Text variant="body" color="secondary">
          {t("settings.profile.noVenue")}
        </Text>
      </Card>
    );
  }

  const isSaving = phase === "saving";
  const fields: FieldsProps = { form, errors, disabled: isSaving, onChange: handleChange };

  return (
    <Card title={t("settings.profile.title")}>
      <Stack gap="md">
        <Text variant="caption" color="secondary">
          {t("settings.profile.description")}
        </Text>

        {phase === "saved" && <Alert variant="success">{t("settings.profile.saved")}</Alert>}
        {phase === "invalid" && <Alert variant="error">{t("settings.profile.fixErrors")}</Alert>}
        {phase === "failed" && saveError && <Alert variant="error">{saveError}</Alert>}

        <Select
          label={t("settings.profile.typeLabel")}
          options={typeOptions(t)}
          value={form.type}
          onChange={(value) => handleChange("type", value)}
          disabled={isSaving}
        />

        <ProfileInput
          {...fields}
          field="cuisines"
          label={t("settings.profile.cuisines")}
          hint={t("settings.profile.cuisinesHint")}
        />

        <ProfileInput
          {...fields}
          field="website"
          label={t("settings.profile.website")}
          hint={t("settings.profile.websiteHint")}
        />

        <TextArea
          label={t("settings.profile.descriptionLabel")}
          hint={
            errors.description
              ? t(ERROR_KEYS[errors.description])
              : t("settings.profile.descriptionHint", { max: VENUE_DESCRIPTION_MAX_LENGTH })
          }
          error={Boolean(errors.description)}
          maxLength={VENUE_DESCRIPTION_MAX_LENGTH}
          value={form.description}
          onChange={(event) => handleChange("description", event.target.value)}
          disabled={isSaving}
        />

        <Text variant="body" color="primary">
          {t("settings.profile.addressHeading")}
        </Text>
        <AddressFields {...fields} />

        <Stack direction="row" gap="sm" justify="end">
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? t("settings.profile.saving") : t("settings.profile.save")}
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
