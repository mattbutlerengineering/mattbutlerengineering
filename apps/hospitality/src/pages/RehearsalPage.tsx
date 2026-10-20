import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Alert, Button, EmptyState } from "@mattbutlerengineering/rialto";
import { handleErrorBoundary } from "@mbe/sentry/react";
import { TimelineSkeleton } from "../components/timeline/TimelineSkeleton";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { RehearsalBanner } from "../components/rehearsal/RehearsalBanner";
import { RehearsalWorkspace } from "../components/rehearsal/RehearsalWorkspace";
import { pickFloorPlan } from "../components/rehearsal/pick-floor-plan";
import { REHEARSAL_PROFILES } from "../components/rehearsal/profiles";
import { parseRehearsalState, rehearsalNavigation } from "../components/rehearsal/rehearsal-route";
import { simulateService } from "../components/rehearsal/simulate-service";
import { useVenue } from "../contexts/VenueContext";
import { useFloorPlans } from "../hooks/useFloorPlans";
import { useTables } from "../hooks/useTables";
import { describeApiError } from "../lib/describe-api-error";
import styles from "./RehearsalPage.module.css";

const TABLES_PAGE_LIMIT = 100;
const FALLBACK_PATH = "/timeline";
const FLOOR_PLANS_PATH = "/floor-plans";

/**
 * The rehearsal route. It mounts no mutation hook and no timeline data hook: tables and floor
 * plans are the only things it reads, and nothing it renders can write. Reloading or opening the
 * URL directly lands without navigation state, which ends the rehearsal.
 */
export function RehearsalPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedVenueId } = useVenue();
  const nav = parseRehearsalState(location.state);
  const profile = nav?.profile;
  const seed = nav?.seed;
  const requestedPlanId = nav?.floorPlanId;
  const enabled = nav !== null && Boolean(selectedVenueId);

  const tablesQuery = useTables({
    venueId: selectedVenueId ?? undefined,
    limit: TABLES_PAGE_LIMIT,
    enabled,
  });
  const plansQuery = useFloorPlans({ venueId: selectedVenueId, enabled });
  const [anchor] = useState(() => new Date());

  const tables = useMemo(
    () => (tablesQuery.data ?? []).filter((table) => table.isActive),
    [tablesQuery.data]
  );
  const floorPlan = useMemo(
    () => pickFloorPlan(plansQuery.data ?? [], tables, requestedPlanId),
    [plansQuery.data, tables, requestedPlanId]
  );
  const loading = tablesQuery.isLoading || plansQuery.isLoading;
  const loadError = tablesQuery.error ?? plansQuery.error;

  // Never runs half-loaded. A throw is a result here, reported below, not a crash.
  const run = useMemo(() => {
    if (profile === undefined || seed === undefined || loading || loadError) return null;
    const { openMinute, closeMinute } = REHEARSAL_PROFILES[profile];
    try {
      const events = simulateService({ tables, openMinute, closeMinute, profile, seed });
      return { events, openMinute, closeMinute, failure: null };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      return { events: [], openMinute, closeMinute, failure };
    }
  }, [profile, seed, loading, loadError, tables]);

  const failure = run?.failure ?? null;
  useEffect(() => {
    if (failure) handleErrorBoundary(failure, { componentStack: "RehearsalPage simulateService" });
  }, [failure]);

  if (nav === null) return <Navigate to={FALLBACK_PATH} replace />;

  const leave = () => {
    if (location.key === "default") navigate(FALLBACK_PATH, { replace: true });
    else navigate(-1);
  };
  const tryAgain = () =>
    navigate(
      ...rehearsalNavigation({
        profile: nav.profile,
        floorPlanId: nav.floorPlanId,
        replace: true,
      })
    );

  let body;
  if (loading) {
    body = <TimelineSkeleton />;
  } else if (loadError) {
    const { detail, raw } = describeApiError(loadError);
    body = (
      <ErrorRetryBanner
        title={t("rehearsal.loadError")}
        error={detail}
        details={raw}
        onRetry={() => {
          void tablesQuery.refetch();
          void plansQuery.refetch();
        }}
      />
    );
  } else if (run?.failure) {
    body = (
      <Alert
        variant="error"
        title={t("rehearsal.error.title")}
        actions={
          <>
            <Button variant="secondary" onClick={tryAgain}>
              {t("rehearsal.error.retry")}
            </Button>
            <Button variant="ghost" onClick={leave}>
              {t("rehearsal.error.leave")}
            </Button>
          </>
        }
      >
        {t("rehearsal.error.body")}
      </Alert>
    );
  } else if (run === null || run.events.length === 0 || floorPlan === null) {
    body = (
      <EmptyState
        variant="flat"
        size="sm"
        icon={null}
        heading={t("rehearsal.notEnough.heading")}
        description={t("rehearsal.notEnough.body")}
        action={<Link to={FLOOR_PLANS_PATH}>{t("rehearsal.notEnough.floorPlans")}</Link>}
      />
    );
  } else {
    return (
      <RehearsalWorkspace
        key={nav.seed}
        events={run.events}
        tables={tables}
        floorPlan={floorPlan}
        profile={nav.profile}
        seed={nav.seed}
        openMinute={run.openMinute}
        closeMinute={run.closeMinute}
        anchor={anchor}
        onLeave={leave}
      />
    );
  }

  return (
    <div className={styles.page}>
      <RehearsalBanner onLeave={leave} />
      <div className={styles.panel}>{body}</div>
    </div>
  );
}
