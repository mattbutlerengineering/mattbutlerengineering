import { useTranslation } from "react-i18next";
import { Tag } from "@mattbutlerengineering/rialto";
import { useVenue } from "../../contexts/VenueContext.js";
import { useAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useNow } from "../../hooks/useNow.js";
import { minutesOfDayIn, venueDate } from "../../utils/service-day.js";
import { shownOnlinePause, isPauseInForce } from "./close-draft.js";

/** App-header pill while online booking is paused; renders nothing otherwise or on a failed read. */
export function OnlinePausedPill() {
  const { t } = useTranslation();
  const { selectedVenueId, selectedVenue } = useVenue();
  const timeZone = selectedVenue?.ianaTimezone ?? "";
  const now = useNow();
  const today = venueDate(now, timeZone);
  const config = useAvailabilityConfig({ venueId: selectedVenueId });
  const minute = minutesOfDayIn(now, timeZone);
  const pause = config.data && shownOnlinePause(config.data.config, timeZone, today, minute);
  // A pause waiting for its start time: online booking is open, so the header does not say paused.
  const paused =
    config.data && pause && isPauseInForce(pause, config.data.config, timeZone, today, minute);
  return paused ? <Tag variant="accent">{t("availability.paused.pill")}</Tag> : null;
}
