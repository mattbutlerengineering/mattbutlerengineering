import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { Skeleton, Text } from "@mattbutlerengineering/rialto";
import {
  availabilityPath,
  readAvailabilityAddress,
  readHoursService,
} from "../components/availability/availability-address.js";
import { AvailabilityQuickSetup } from "../components/availability/AvailabilityQuickSetup.js";
import { focusHubRowOnReturn } from "../components/availability/hub-return-focus.js";
import { wasOpenedFromHub } from "../components/availability/opened-from-hub.js";
import { RegularHoursEditor } from "../components/availability/RegularHoursEditor.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import { useAvailabilityConfig } from "../hooks/useAvailability.js";
import { useAvailabilityScope, type AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { describeApiError } from "../lib/describe-api-error.js";
import styles from "./AvailabilityHoursPage.module.css";

/**
 * `availability/hours` (availability-hub ux.md, "Regular hours"): the weekly hours from a start
 * date, with `?service=` naming the service to open. A venue with no hours gets the first-setup
 * card here. A save returns to the hub with focus on row 1 and Undo on offer from the layout,
 * once the saved version has loaded, so the hub shows what was saved.
 */
export function AvailabilityHoursPage() {
  const { t } = useTranslation();
  const scope = useAvailabilityScope();
  const location = useLocation();
  const { from } = readAvailabilityAddress(location);
  const hub = availabilityPath({ view: "hub", ...(from && { from }) });
  const { focusAfter } = useFocusAfter();
  useEffect(() => focusAfter({ kind: "pageHeading" }), [focusAfter]);
  const refreshError = useRefreshError(scope.venueId);
  const fromHub = wasOpenedFromHub(location.state);
  const onSaved = useReturnToHub(scope.state?.version ?? 0, hub, refreshError, fromHub);

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("availabilityHub.routes.regularHours")}
        aside={
          <div className={styles.links}>
            <Link to={hub} className={styles.link}>
              {t("availabilityHub.hours.back")}
            </Link>
            {from === "setup" && (
              <Link to="/setup" className={styles.link}>
                {t("availability.backToSetup")}
              </Link>
            )}
          </div>
        }
      />
      <HoursBody
        scope={scope}
        service={readHoursService(location)}
        refreshError={refreshError}
        onSaved={onSaved}
      />
    </div>
  );
}

AvailabilityHoursPage.displayName = "AvailabilityHoursPage";

/** Why the latest refresh of a config on hand failed; `null` while it has not. */
function useRefreshError(venueId: string | null): string | null {
  const config = useAvailabilityConfig({ venueId });
  return config.data && config.error ? describeApiError(config.error).detail : null;
}

/**
 * After a save, back to the hub once the saved version is the one on hand (or its refresh
 * failed), so the hub never shows the hours from before. Opened from a hub row, Back is the way,
 * so no second hub entry is left; loaded any other way, the hub replaces this entry.
 */
function useReturnToHub(
  version: number,
  hub: string,
  refreshError: string | null,
  fromHub: boolean
) {
  const navigate = useNavigate();
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const ready = savedVersion !== null && (version >= savedVersion || refreshError !== null);
  useEffect(() => {
    if (!ready) return;
    focusHubRowOnReturn("hub-row-1");
    void (fromHub ? navigate(-1) : navigate(hub, { replace: true }));
  }, [ready, fromHub, navigate, hub]);
  return setSavedVersion;
}

interface HoursBodyProps {
  readonly scope: AvailabilityScope;
  readonly service: string | null;
  readonly refreshError: string | null;
  /** A save landed at this version: the page goes back to the hub. */
  readonly onSaved: (version: number) => void;
}

/** Below the header: no venue, the load failure, loading, first setup, or the form. */
function HoursBody({ scope, service, refreshError, onSaved }: HoursBodyProps) {
  const { t } = useTranslation();
  const { venueId, state, load, loadError, refresh, today, offerUndo } = scope;
  // First setup stays on screen once saved, until the page leaves: the refreshed hours would
  // otherwise swap the card for the form for a moment.
  const [setUp, setSetUp] = useState(false);
  if (!venueId) {
    return (
      <Text variant="body" color="secondary">
        {t("availability.noVenue")}
      </Text>
    );
  }
  if (load === "error") {
    return (
      <ErrorRetryBanner
        title={t("availability.loadError")}
        error={loadError ?? t("availabilityHub.hub.loadErrorDetail")}
        onRetry={refresh}
      />
    );
  }
  if (state === null) {
    return (
      <div role="status" aria-label={t("availabilityHub.hours.loading")}>
        <Skeleton variant="text" lines={4} />
      </div>
    );
  }
  if (state.source === "empty" || setUp) {
    return (
      <AvailabilityQuickSetup
        venueId={venueId}
        state={state}
        onStale={refresh}
        onSaved={(title, saved) => {
          offerUndo(title, saved);
          setSetUp(true);
          onSaved(saved.version);
        }}
      />
    );
  }
  return (
    <RegularHoursEditor
      key={venueId}
      venueId={venueId}
      state={state}
      today={today}
      onStale={refresh}
      refreshError={refreshError}
      service={service}
      offerUndo={offerUndo}
      onSaved={(saved) => onSaved(saved.version)}
    />
  );
}
