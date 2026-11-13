import { useCallback, useEffect, useMemo, useRef } from "react";
import { Outlet } from "react-router";
import { AvailabilityDialogHost } from "../components/availability/AvailabilityDialogHost.js";
import { StrandedRevertDialog } from "../components/availability/StrandedRevertDialog.js";
import { useVenue } from "../contexts/VenueContext.js";
import { useAvailabilityConfig } from "../hooks/useAvailability.js";
import { useAvailabilityDialogs } from "../hooks/useAvailabilityDialogs.js";
import { availabilityLoad, type AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useAvailabilityUndo } from "../hooks/useAvailabilityUndo.js";
import { useManagerAccess } from "../hooks/useIsManager.js";
import { useNow } from "../hooks/useNow.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { venueDate } from "../utils/service-day.js";
import styles from "./AvailabilityLayout.module.css";

/**
 * The parent of every Availability route: it reads what the children share, once, and hands it
 * down through the outlet (`useAvailabilityScope()`). It also owns Undo, so the offer outlives the
 * child that saved, and the dialog that lists the bookings blocking a refused one. It hosts the
 * Close and Pause dialogs over any child, from `?close=` and `?pause=1` (`openClose`, `openPause`).
 *
 * It renders no page chrome. Today's page, mounted at `calendar`, renders its own header and says
 * itself when the config failed to load, so the layout showing either would show it twice. The
 * scope says where the read stands (`load`, `rolePending`) and each new child words it.
 */
export function AvailabilityLayout() {
  const { selectedVenueId, selectedVenue } = useVenue();
  const timezone = selectedVenue?.ianaTimezone ?? "";
  const today = venueDate(useNow(), timezone);
  const config = useAvailabilityConfig({ venueId: selectedVenueId });
  const { isManager, isPending: rolePending } = useManagerAccess();
  const { refetch } = config;
  const offer = useAvailabilityUndo();
  const state = config.data ?? null;
  const load = availabilityLoad(state, config.error != null);
  const loadError = state === null && config.error ? describeApiError(config.error).detail : null;

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
  const dialogs = useAvailabilityDialogs();
  const { openClose, openPause } = dialogs;

  const scope = useMemo<AvailabilityScope>(
    () => ({
      venueId: selectedVenueId,
      timezone,
      today,
      state,
      load,
      loadError,
      isManager,
      rolePending,
      refresh,
      offerUndo,
      openClose,
      openPause,
    }),
    [
      selectedVenueId,
      timezone,
      today,
      state,
      load,
      loadError,
      isManager,
      rolePending,
      refresh,
      offerUndo,
      openClose,
      openPause,
    ]
  );
  return (
    <>
      <Outlet context={scope} />
      <div className={styles.dialogs}>
        <AvailabilityDialogHost scope={scope} dialogs={dialogs} />
        {/* Last: a top-level Dialog stacks by document order, so a refused Undo's list paints
            above a Close or Pause dialog the host has open, and above any child's drawer. */}
        <StrandedRevertDialog />
      </div>
    </>
  );
}

AvailabilityLayout.displayName = "AvailabilityLayout";
