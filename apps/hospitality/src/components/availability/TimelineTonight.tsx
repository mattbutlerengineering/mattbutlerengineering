import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import { useVenue } from "../../contexts/VenueContext.js";
import { useAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useNow } from "../../hooks/useNow.js";
import { useVenueFloorPlanSections } from "../../hooks/useFloorPlans.js";
import { useTables } from "../../hooks/useTables.js";
import { useVenueTeam } from "../../hooks/useVenueTeam.js";
import { TonightControl } from "./TonightControl.js";

const OPEN_PARAM = "tonight";

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
  const sections = useVenueFloorPlanSections({ venueId: selectedVenueId });
  // The Today line's link (`?tonight=open`) asks for the panel once, as the page mounts; the
  // param is then removed so a reload or Back does not reopen it. The request is kept until the
  // control (which waits for its reads) has mounted, then spent: a later remount (a venue
  // switch, a Retry) must not pop the panel open again.
  const [params, setParams] = useSearchParams();
  const [openRequested, setOpenRequested] = useState(() => params.get(OPEN_PARAM) === "open");
  const controlMounted = !!config.data && !!team.data;
  useEffect(() => {
    if (controlMounted) setOpenRequested(false);
  }, [controlMounted]);
  useEffect(() => {
    if (params.get(OPEN_PARAM) !== "open") return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(OPEN_PARAM);
        return next;
      },
      { replace: true }
    );
  }, [params, setParams]);
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
      sections={sections.data ?? []}
      defaultOpen={openRequested}
    />
  );
}
