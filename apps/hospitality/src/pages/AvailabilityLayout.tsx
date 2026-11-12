import { Outlet } from "react-router";
import { useVenue } from "../contexts/VenueContext.js";
import { useAvailabilityConfig } from "../hooks/useAvailability.js";
import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useManagerAccess } from "../hooks/useIsManager.js";
import { useNow } from "../hooks/useNow.js";
import { venueDate } from "../utils/service-day.js";

/**
 * The parent of every Availability route: it reads what the children share, once, and hands it
 * down through the outlet (`useAvailabilityScope()`).
 *
 * It renders nothing of its own yet. Today's page, mounted at `calendar`, still renders the page
 * header and says when the config failed to load; the layout takes those over as the views that
 * replace that page land.
 */
export function AvailabilityLayout() {
  const { selectedVenueId, selectedVenue } = useVenue();
  const timezone = selectedVenue?.ianaTimezone ?? "";
  const today = venueDate(useNow(), timezone);
  const config = useAvailabilityConfig({ venueId: selectedVenueId });
  const { isManager } = useManagerAccess();
  const { refetch } = config;

  const scope: AvailabilityScope = {
    venueId: selectedVenueId,
    timezone,
    today,
    state: config.data ?? null,
    isManager,
    refresh: () => void refetch(),
  };
  return <Outlet context={scope} />;
}

AvailabilityLayout.displayName = "AvailabilityLayout";
