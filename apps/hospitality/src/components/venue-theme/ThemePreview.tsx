import type { CSSProperties } from "react";
import { Button, Text } from "@mattbutlerengineering/rialto";
import type { VenueTheme } from "@mbe/types/schemas";
import { useTranslation } from "react-i18next";
import { themeToCssVars } from "../../lib/venue-theme.js";
import styles from "./venue-theme.module.css";

/** Scoped preview: the palette applies to this subtree only, via rialto's custom properties. */
export function ThemePreview({ theme }: { readonly theme: VenueTheme | null }) {
  const { t } = useTranslation();
  const vars = theme ? (themeToCssVars(theme) as CSSProperties) : undefined;
  return (
    <div className={styles.preview} style={vars} data-testid="theme-preview">
      <Text variant="label" color="primary">
        {t("venueTheme.previewTitle")}
      </Text>
      <Button variant="primary" type="button" tabIndex={-1}>
        {t("venueTheme.previewButton")}
      </Button>
    </div>
  );
}
