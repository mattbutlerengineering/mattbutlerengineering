import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button, Card, Stack, Text } from "@mattbutlerengineering/rialto";
import { useVenue } from "../../contexts/VenueContext";
import { useTables } from "../../hooks/useTables";
import { rehearsalNavigation } from "./rehearsal-route";

const TABLES_PAGE_LIMIT = 100;

/** Settings entry point: the durable way back to the rehearsal once the onboarding alert is gone. */
export function RehearsalSettingsCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedVenueId } = useVenue();
  const { data, isLoading, error } = useTables({
    venueId: selectedVenueId ?? undefined,
    limit: TABLES_PAGE_LIMIT,
    enabled: Boolean(selectedVenueId),
  });

  const known = !isLoading && error === null && data !== undefined;
  const hasTables = known && data.some((table) => table.isActive);

  return (
    <Card title={t("settings.rehearsal.title")}>
      <Stack gap="md">
        <Text variant="caption" color="secondary">
          {t("settings.rehearsal.body")}
        </Text>
        <Button
          variant="secondary"
          disabled={!hasTables}
          onClick={() => navigate(...rehearsalNavigation({ profile: "friday" }))}
        >
          {t("rehearsal.cta.run")}
        </Button>
        {known && !hasTables ? (
          <Text variant="caption" color="secondary">
            {t("settings.rehearsal.noTables")}{" "}
            <Link to="/floor-plans">{t("settings.rehearsal.floorPlans")}</Link>
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
