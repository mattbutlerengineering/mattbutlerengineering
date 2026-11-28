import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { Skeleton, Text } from "@mattbutlerengineering/rialto";
import {
  availabilityPath,
  readAvailabilityAddress,
} from "../components/availability/availability-address.js";
import { SpecialDatesTab } from "../components/availability/SpecialDatesTab.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import { useVenueFloorPlanSections } from "../hooks/useFloorPlans.js";
import { useAvailabilityScope, type AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import styles from "./AvailabilityClosuresPage.module.css";

/**
 * `availability/special-dates` (#9944 S2c): the special dates and holidays list, a page of its own
 * instead of a tab of the old Availability page. A Host reads it; the edit controls are a
 * Manager's.
 */
export function AvailabilitySpecialDatesPage() {
  const { t } = useTranslation();
  const scope = useAvailabilityScope();
  const { from } = readAvailabilityAddress(useLocation());
  const { focusAfter } = useFocusAfter();
  useEffect(() => focusAfter({ kind: "pageHeading" }), [focusAfter]);

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("availabilityHub.routes.specialDates")}
        aside={
          <Link
            to={availabilityPath({ view: "hub", ...(from && { from }) })}
            className={styles.link}
          >
            {t("availabilityHub.seasonal.back")}
          </Link>
        }
      />
      <SpecialDatesBody scope={scope} />
    </div>
  );
}

AvailabilitySpecialDatesPage.displayName = "AvailabilitySpecialDatesPage";

/** Below the header: no venue, the load failure, loading, or the list. */
function SpecialDatesBody({ scope }: { readonly scope: AvailabilityScope }) {
  const { t } = useTranslation();
  const { venueId, state, load, loadError, refresh } = scope;
  const sections = useVenueFloorPlanSections({ venueId: venueId ?? "" });
  const sectionNames = useMemo(
    () => new Map((sections.data ?? []).map((section) => [section.id, section.name])),
    [sections.data]
  );
  const navigate = useNavigate();
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
      <div role="status" aria-label={t("availabilityHub.routes.specialDates")}>
        <Skeleton variant="text" lines={4} />
      </div>
    );
  }
  return (
    <SpecialDatesTab
      venueId={venueId}
      state={state}
      timezone={scope.timezone}
      today={scope.today}
      onStale={refresh}
      isManager={scope.isManager}
      sectionNames={sectionNames}
      onOpenDay={(date) => void navigate(availabilityPath({ view: "calendar", date }))}
    />
  );
}
