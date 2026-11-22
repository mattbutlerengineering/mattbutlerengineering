import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Skeleton, Text } from "@mattbutlerengineering/rialto";
import {
  availabilityPath,
  readAvailabilityAddress,
} from "../components/availability/availability-address.js";
import { ClosuresPanel } from "../components/availability/ClosuresPanel.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import { useAvailabilityScope, type AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import styles from "./AvailabilityClosuresPage.module.css";

/**
 * `availability/closures` (availability-hub ux.md, "Closures and pauses"): what is closed or
 * paused now, what is to come, and refunds still open, each with the way to change or end it. A
 * Host reads the list and opens the call list; the edit controls are a Manager's.
 */
export function AvailabilityClosuresPage() {
  const { t } = useTranslation();
  const scope = useAvailabilityScope();
  const { from } = readAvailabilityAddress(useLocation());
  const { focusAfter } = useFocusAfter();
  useEffect(() => focusAfter({ kind: "pageHeading" }), [focusAfter]);

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("availabilityHub.closuresPage.title")}
        aside={
          <Link
            to={availabilityPath({ view: "hub", ...(from && { from }) })}
            className={styles.link}
          >
            {t("availabilityHub.seasonal.back")}
          </Link>
        }
      />
      <ClosuresBody scope={scope} />
    </div>
  );
}

AvailabilityClosuresPage.displayName = "AvailabilityClosuresPage";

/** Below the header: no venue, the load failure, loading, or the list. */
function ClosuresBody({ scope }: { readonly scope: AvailabilityScope }) {
  const { t } = useTranslation();
  const { venueId, state, load, loadError, refresh } = scope;
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
      <div role="status" aria-label={t("availabilityHub.closuresPage.loading")}>
        <Skeleton variant="text" lines={4} />
      </div>
    );
  }
  return <ClosuresPanel venueId={venueId} state={state} scope={scope} />;
}
