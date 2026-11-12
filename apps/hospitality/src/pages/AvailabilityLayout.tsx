import { useCallback, useEffect, useMemo, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { isTodaysPage } from "../components/availability/availability-address.js";
import { StrandedRevertDialog } from "../components/availability/StrandedRevertDialog.js";
import { useVenue } from "../contexts/VenueContext.js";
import { useAvailabilityConfig } from "../hooks/useAvailability.js";
import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useAvailabilityUndo } from "../hooks/useAvailabilityUndo.js";
import { useManagerAccess } from "../hooks/useIsManager.js";
import { useNow } from "../hooks/useNow.js";
import { venueDate } from "../utils/service-day.js";

/**
 * The parent of every Availability route: it reads what the children share, once, and hands it
 * down through the outlet (`useAvailabilityScope()`). It also owns Undo, so the offer outlives the
 * child that saved, and the dialog that lists the bookings blocking a refused one.
 *
 * It renders no page chrome yet. Today's page, mounted at `calendar`, still renders the page
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
  const offer = useAvailabilityUndo();
  const { pathname } = useLocation();
  const state = config.data ?? null;

  // `refresh` and `offerUndo` keep one identity for the life of the layout, so a child can list
  // them (or the scope) as a dependency. They read what the hooks returned on the latest render.
  const latest = useRef({ refetch, offer, venueId: selectedVenueId });
  useEffect(() => {
    latest.current = { refetch, offer, venueId: selectedVenueId };
  });
  const refresh = useCallback<AvailabilityScope["refresh"]>(
    () => void latest.current.refetch(),
    []
  );
  const offerUndo = useCallback<AvailabilityScope["offerUndo"]>((title, saved) => {
    const { venueId } = latest.current;
    // A save is made against a venue, so one is selected whenever there is a save to undo.
    if (venueId) latest.current.offer({ venueId, title, saved });
  }, []);

  const scope = useMemo<AvailabilityScope>(
    () => ({ venueId: selectedVenueId, timezone, today, state, isManager, refresh, offerUndo }),
    [selectedVenueId, timezone, today, state, isManager, refresh, offerUndo]
  );
  return (
    <>
      <Outlet context={scope} />
      {/* Today's page mounts its own until it is deleted (D5.3); two would both open. */}
      {!isTodaysPage(pathname) && <StrandedRevertDialog />}
    </>
  );
}

AvailabilityLayout.displayName = "AvailabilityLayout";
