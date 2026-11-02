import { useTranslation } from "react-i18next";
import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import { useVenue } from "../../contexts/VenueContext.js";
import { useAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useNow } from "../../hooks/useNow.js";
import { useTables } from "../../hooks/useTables.js";
import { useVenueTeam } from "../../hooks/useVenueTeam.js";
import { TonightControl } from "./TonightControl.js";

/**
 * The timeline header's Tonight control, wired to the venue. Renders nothing until the venue's
 * availability config and the viewer's role have loaded: the panel never guesses a role. A read
 * that failed says so with Retry, because this is where a Host finds Emergency close.
 */
export function TimelineTonight() {
  const { t } = useTranslation();
  const { selectedVenueId, selectedVenue } = useVenue();
  const now = useNow();
  const config = useAvailabilityConfig({ venueId: selectedVenueId });
  const team = useVenueTeam({ venueId: selectedVenueId });
  const tables = useTables({ venueId: selectedVenueId ?? undefined, activeOnly: true });
  if (!selectedVenueId || !selectedVenue) return null;
  const failed = [config, team].filter((read) => !read.data && read.error);
  if (failed.length > 0) {
    return (
      <Stack direction="row" gap="sm" align="center" role="alert">
        <Text as="span" variant="caption" color="error">
          {t("availability.tonight.loadError")}
        </Text>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => failed.forEach((read) => void read.refetch())}
        >
          {t("errorBanner.retry")}
        </Button>
      </Stack>
    );
  }
  if (!config.data || !team.data) return null;
  return (
    <TonightControl
      venueId={selectedVenueId}
      state={config.data}
      timezone={selectedVenue.ianaTimezone}
      now={now}
      viewerRole={team.data.viewerRole}
      hostEmergencyClose={team.data.hostEmergencyClose}
      tables={tables.data ?? []}
    />
  );
}
