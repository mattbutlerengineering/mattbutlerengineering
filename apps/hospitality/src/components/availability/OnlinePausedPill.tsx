import { useTranslation } from "react-i18next";
import { Tag } from "@mattbutlerengineering/rialto";
import { useVenue } from "../../contexts/VenueContext.js";
import { useAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useNow } from "../../hooks/useNow.js";
import { venueDate } from "../../utils/service-day.js";
import { activeOnlinePause } from "./close-draft.js";

/** App-header pill while online booking is paused; renders nothing otherwise or on a failed read. */
export function OnlinePausedPill() {
  const { t } = useTranslation();
  const { selectedVenueId, selectedVenue } = useVenue();
  const today = venueDate(useNow(), selectedVenue?.ianaTimezone ?? "");
  const config = useAvailabilityConfig({ venueId: selectedVenueId });
  const paused = config.data ? activeOnlinePause(config.data.config.dateRules, today) : null;
  return paused ? <Tag variant="accent">{t("availability.paused.pill")}</Tag> : null;
}
