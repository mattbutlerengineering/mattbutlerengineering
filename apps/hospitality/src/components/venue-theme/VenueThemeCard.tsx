import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, ImageUpload, Stack, Text } from "@mattbutlerengineering/rialto";
import { VenueThemeSchema, type VenueTheme } from "@mbe/types/schemas";
import { useOptionalVenue } from "../../contexts/venue-context-object.js";
import { useUpdateVenue } from "../../hooks/useVenues.js";
import { checkThemeContrast, paletteToTheme } from "../../lib/venue-theme.js";
import {
  ACCEPTED_LOGO_TYPES,
  MAX_LOGO_BYTES,
  readLogoPalette,
  type LogoPaletteFailure,
} from "../../lib/logo-palette-canvas.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { ColorSwatch } from "./ColorSwatch.js";
import { ThemePreview } from "./ThemePreview.js";

const LOGO_FAILURE_KEYS = {
  "unsupported-type": "venueTheme.logoUnsupportedType",
  "too-large": "venueTheme.logoTooLarge",
  "decode-failed": "venueTheme.logoDecodeFailed",
} as const satisfies Record<LogoPaletteFailure, string>;

export function VenueThemeCard() {
  const { t } = useTranslation();
  const venue = useOptionalVenue()?.selectedVenue ?? null;
  const update = useUpdateVenue();
  const saved = VenueThemeSchema.safeParse(venue?.settings?.["theme"]);
  const [accent, setAccent] = useState(saved.success ? saved.data.accent : "");
  const [accentHover, setAccentHover] = useState(saved.success ? saved.data.accentHover : "");
  const [source, setSource] = useState<VenueTheme["source"]>(
    saved.success ? saved.data.source : "manual"
  );
  const [logoError, setLogoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!venue) return null;

  const parsed = VenueThemeSchema.safeParse({ accent, accentHover, source });
  const theme: VenueTheme | null = parsed.success ? parsed.data : null;
  const contrast = theme ? checkThemeContrast(theme) : null;
  const unreadable = contrast !== null && !contrast.ok;

  /** A colour the operator typed is theirs, whatever the logo said. */
  const editAccent = (value: string) => {
    setAccent(value);
    setSource("manual");
  };
  const editAccentHover = (value: string) => {
    setAccentHover(value);
    setSource("manual");
  };

  /**
   * The logo is read in this browser and thrown away; only the palette it
   * yields reaches state, and only a readable palette can then be saved.
   */
  const extractFromLogo = async (file: File | null) => {
    setLogoError(null);
    if (!file) return;
    const result = await readLogoPalette(file);
    if (!result.ok) {
      setLogoError(t(LOGO_FAILURE_KEYS[result.reason]));
      return;
    }
    const extracted = paletteToTheme(result.palette);
    if (!extracted) {
      setLogoError(t("venueTheme.logoNoColours"));
      return;
    }
    setAccent(extracted.accent);
    setAccentHover(extracted.accentHover);
    setSource(extracted.source);
  };

  const save = async () => {
    if (!theme || unreadable) return;
    setError(null);
    try {
      await update.mutateAsync({
        venueId: venue.id,
        data: { settings: { ...venue.settings, theme } },
      });
    } catch (err) {
      setError(describeApiError(err).detail);
    }
  };

  return (
    <Card title={t("venueTheme.title")}>
      <Stack gap="md">
        <Text variant="caption" color="secondary">
          {t("venueTheme.description")}
        </Text>
        <ImageUpload
          size="sm"
          label={t("venueTheme.logoLabel")}
          hint={t("venueTheme.logoHint")}
          accept={ACCEPTED_LOGO_TYPES.join(",")}
          maxSize={MAX_LOGO_BYTES}
          onChange={(file) => void extractFromLogo(file)}
          onValidationError={setLogoError}
        />
        {logoError && <Alert variant="error">{logoError}</Alert>}
        <ColorSwatch
          label={t("venueTheme.accent")}
          value={accent}
          onChange={editAccent}
          error={accent !== "" && !VenueThemeSchema.shape.accent.safeParse(accent).success}
        />
        <ColorSwatch
          label={t("venueTheme.accentHover")}
          value={accentHover}
          onChange={editAccentHover}
          error={
            accentHover !== "" && !VenueThemeSchema.shape.accentHover.safeParse(accentHover).success
          }
        />
        <ThemePreview theme={theme} />
        {unreadable && <Alert variant="error">{t("venueTheme.contrastFailed")}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        <Button variant="primary" onClick={save} disabled={!theme || unreadable}>
          {t("venueTheme.save")}
        </Button>
      </Stack>
    </Card>
  );
}
