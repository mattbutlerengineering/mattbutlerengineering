import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Stack, Text } from "@mattbutlerengineering/rialto";
import { VenueThemeSchema, type VenueTheme } from "@mbe/types/schemas";
import { useOptionalVenue } from "../../contexts/venue-context-object.js";
import { useUpdateVenue } from "../../hooks/useVenues.js";
import { checkThemeContrast } from "../../lib/venue-theme.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { ColorSwatch } from "./ColorSwatch.js";
import { ThemePreview } from "./ThemePreview.js";

export function VenueThemeCard() {
  const { t } = useTranslation();
  const venue = useOptionalVenue()?.selectedVenue ?? null;
  const update = useUpdateVenue();
  const saved = VenueThemeSchema.safeParse(venue?.settings?.["theme"]);
  const [accent, setAccent] = useState(saved.success ? saved.data.accent : "");
  const [accentHover, setAccentHover] = useState(saved.success ? saved.data.accentHover : "");
  const [error, setError] = useState<string | null>(null);

  if (!venue) return null;

  const parsed = VenueThemeSchema.safeParse({ accent, accentHover, source: "manual" });
  const theme: VenueTheme | null = parsed.success ? parsed.data : null;
  const contrast = theme ? checkThemeContrast(theme) : null;
  const unreadable = contrast !== null && !contrast.ok;

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
        <ColorSwatch
          label={t("venueTheme.accent")}
          value={accent}
          onChange={setAccent}
          error={accent !== "" && !VenueThemeSchema.shape.accent.safeParse(accent).success}
        />
        <ColorSwatch
          label={t("venueTheme.accentHover")}
          value={accentHover}
          onChange={setAccentHover}
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
