import { useTranslation } from "react-i18next";
import { Card, Stack, Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { LocalePicker } from "./LocalePicker/index.js";

/** Fixed sample values: the preview shows notation only, never live data. */
const SAMPLE_DATE = "2026-10-13";
const SAMPLE_TIME = "19:30";
const SAMPLE_AMOUNT_CENTS = 123450;

/**
 * Settings "Language & region" row: the same choice as the sidebar footer,
 * plus a preview of date/time/money notation in the selected locale.
 */
export function LanguageRegionCard() {
  const { t } = useTranslation();
  const fmt = useVenueFormat();

  return (
    <Card title={t("staffLocaleSwitcher.title")}>
      <Stack gap="sm">
        <LocalePicker variant="settings" />
        <div data-testid="format-preview">
          <Text variant="caption" color="secondary">
            {t("staffLocaleSwitcher.previewLabel")}
          </Text>
          <Text variant="body" color="primary">
            {`${fmt.formatShortDate(SAMPLE_DATE)} · ${fmt.formatLocalTime(SAMPLE_TIME)} · ${fmt.formatMoney(SAMPLE_AMOUNT_CENTS)}`}
          </Text>
        </div>
      </Stack>
    </Card>
  );
}
