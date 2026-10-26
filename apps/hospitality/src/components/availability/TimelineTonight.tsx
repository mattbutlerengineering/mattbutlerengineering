import { useVenue } from "../../contexts/VenueContext.js";
import { useAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useNow } from "../../hooks/useNow.js";
import { useTables } from "../../hooks/useTables.js";
import { useVenueTeam } from "../../hooks/useVenueTeam.js";
import { TonightControl } from "./TonightControl.js";

/**
 * The timeline header's Tonight control, wired to the venue. Renders nothing until the venue's
 * availability config and the viewer's role have loaded: the panel never guesses a role.
 */
export function TimelineTonight() {
  const { selectedVenueId, selectedVenue } = useVenue();
  const now = useNow();
  const config = useAvailabilityConfig({ venueId: selectedVenueId });
  const team = useVenueTeam({ venueId: selectedVenueId });
  const tables = useTables({ venueId: selectedVenueId ?? undefined, activeOnly: true });
  if (!selectedVenueId || !selectedVenue || !config.data || !team.data) return null;
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
