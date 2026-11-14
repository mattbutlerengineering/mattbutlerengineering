import { lazy, Suspense, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import type { AvailabilityDialogs } from "../../hooks/useAvailabilityDialogs.js";
import type { AvailabilityScope } from "../../hooks/useAvailabilityScope.js";
import { useNow } from "../../hooks/useNow.js";
import { currentServiceDate } from "../../utils/current-service-date.js";
import { dialogSearch, readAvailabilityAddress } from "./availability-address.js";
import { closeDialogStart } from "./close-dialog-start.js";

// Loaded on first open, so the hub's first paint does not carry either dialog.
const CloseDialog = lazy(() =>
  import("./CloseDialog.js").then((m) => ({ default: m.CloseDialog }))
);
const PauseOnlineDialog = lazy(() =>
  import("./PauseOnlineDialog.js").then((m) => ({ default: m.PauseOnlineDialog }))
);

interface AvailabilityDialogHostProps {
  readonly scope: AvailabilityScope;
  readonly dialogs: Pick<AvailabilityDialogs, "opened" | "leave">;
}

/**
 * What the address asks the layout to open, and whether it must instead be dropped: a Host has
 * no Close or Pause (ux.md "Host"), and a close target that does not parse opens nothing.
 */
function useAsked(scope: AvailabilityScope, dialogs: AvailabilityDialogHostProps["dialogs"]) {
  const location = useLocation();
  const address = readAvailabilityAddress(location);
  const closeAsked = new URLSearchParams(location.search).has("close");
  const close = dialogs.opened?.target ?? address.close;
  const asked = closeAsked || address.pause;
  const isHost = !scope.rolePending && !scope.isManager;
  const unreadable = closeAsked && close === null;
  return { location, close, pause: address.pause, drop: asked && (isHost || unreadable) };
}

/**
 * The Close and Pause dialogs over whichever Availability view is open (architecture.md "Layout
 * Close and Pause host"), from `?close=<target>` and `?pause=1`. A Host, or a close target that
 * does not parse, gets no dialog and the param is removed with a replace. While the role or the
 * config is read, nothing opens yet and the param stays.
 */
export function AvailabilityDialogHost({ scope, dialogs }: AvailabilityDialogHostProps) {
  const navigate = useNavigate();
  const now = useNow();
  const { location, close, pause, drop } = useAsked(scope, dialogs);
  const { search, state: historyState } = location;

  useEffect(() => {
    if (!drop) return;
    void navigate({ search: dialogSearch(search, null) }, { replace: true, state: historyState });
  }, [drop, search, historyState, navigate]);

  const { venueId, state, timezone, today, offerUndo } = scope;
  if (drop || !scope.isManager || !venueId || !state || (!close && !pause)) return null;
  return (
    <Suspense fallback={null}>
      {close ? (
        <CloseDialog
          venueId={venueId}
          state={state}
          timezone={timezone}
          today={today}
          {...closeDialogStart(close)}
          onSavedQuietly={(saved, title) => offerUndo(title, saved)}
          onSaved={dialogs.opened?.onSaved}
          onClose={dialogs.leave}
        />
      ) : (
        <PauseOnlineDialog
          venueId={venueId}
          state={state}
          // The service date: past midnight on a night still running, Tonight is that night.
          today={currentServiceDate(state.config, timezone, now)}
          onSaved={(saved, title) => offerUndo(title, saved)}
          onClose={dialogs.leave}
        />
      )}
    </Suspense>
  );
}

AvailabilityDialogHost.displayName = "AvailabilityDialogHost";
