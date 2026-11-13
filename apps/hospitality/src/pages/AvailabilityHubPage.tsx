import { useEffect, useId, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation } from "react-router";
import { Heading, Skeleton, Text } from "@mattbutlerengineering/rialto";
import {
  availabilityPath,
  legacyRedirect,
  readAvailabilityAddress,
} from "../components/availability/availability-address.js";
import { DateCheck } from "../components/availability/hub/DateCheck.js";
import { dateAnswer } from "../components/availability/hub/date-answer.js";
import { hubActions, type HubAction } from "../components/availability/hub/hub-actions.js";
import { hubRowTexts } from "../components/availability/hub/hub-row-text.js";
import type { HubRowModels } from "../components/availability/hub/hub-rows.js";
import { shortDate } from "../components/availability/hub/hub-text.js";
import { HubRow, type HubRowAction } from "../components/availability/hub/HubRow.js";
import { TodayLine } from "../components/availability/TodayLine.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import { useAvailabilityHub } from "../hooks/useAvailabilityHub.js";
import { useAvailabilityScope, type AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import styles from "../components/availability/hub/Hub.module.css";

/**
 * The index of `availability` (availability-hub ux.md, "Hub"): what is set up, row by row, and
 * which rule decides a date. An old address (`?tab=`, `?action=addSchedule`, `?closeSection=`)
 * still lands on the view it named, with a replace, so Back does not loop.
 */
export function AvailabilityHubPage() {
  const { search } = useLocation();
  const old = legacyRedirect(search);
  return old ? <Navigate to={old} replace /> : <AvailabilityHub />;
}

AvailabilityHubPage.displayName = "AvailabilityHubPage";

function AvailabilityHub() {
  const { t } = useTranslation();
  const scope = useAvailabilityScope();
  const { venueId } = scope;
  const { from } = readAvailabilityAddress(useLocation());
  const { focusAfter } = useFocusAfter();
  // Arriving on the hub puts focus on its heading, so a screen reader starts at the top of it.
  useEffect(() => focusAfter({ kind: "pageHeading" }), [focusAfter]);

  const backLink = from === "setup" && (
    <Link to="/setup" className={styles.link}>
      {t("availability.backToSetup")}
    </Link>
  );
  return (
    <div className={styles.page}>
      <PageHeader
        title={t("availability.title")}
        description={
          venueId ? <TodayLine venueId={venueId} bannerShowsOnline={false} /> : undefined
        }
        aside={backLink || undefined}
      />
      {venueId ? (
        <HubBody scope={scope} />
      ) : (
        <Text variant="body" color="secondary">
          {t("availability.noVenue")}
        </Text>
      )}
    </div>
  );
}

/** Below the header: loading, the load failure, the empty venue, or the date check and the rows. */
function HubBody({ scope }: { readonly scope: AvailabilityScope }) {
  const { t } = useTranslation();
  const { load, loadError, rolePending, isManager, refresh } = scope;
  const hub = useAvailabilityHub(scope);
  const { from } = readAvailabilityAddress(useLocation());

  if (load === "error") {
    return (
      <ErrorRetryBanner
        title={t("availability.loadError")}
        error={loadError ?? t("availabilityHub.hub.loadErrorDetail")}
        onRetry={refresh}
      />
    );
  }
  // The role decides what an empty venue shows and which actions a row has, so it is waited for.
  if (hub === null || rolePending) {
    return (
      <div role="status" aria-label={t("availabilityHub.hub.loading")}>
        <Skeleton variant="text" lines={5} />
      </div>
    );
  }
  if (hub.kind === "emptyVenue") {
    return isManager ? (
      // Regular hours shows the first-setup card; the way back to Venue Setup is carried.
      <Navigate to={availabilityPath({ view: "hours", ...(from && { from }) })} replace />
    ) : (
      <Text variant="body" color="secondary">
        {t("availabilityHub.hub.hostEmpty")}
      </Text>
    );
  }
  return <HubRules scope={scope} rows={hub.rows} />;
}

interface HubRulesProps {
  readonly scope: AvailabilityScope;
  readonly rows: HubRowModels;
}

function HubRules({ scope, rows }: HubRulesProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { state, timezone, today, isManager } = scope;
  const rulesId = useId();
  const [date, setDate] = useState<string | null>(null);
  const config = state?.config;
  const answer = useMemo(
    () => (config && date ? dateAnswer(config, timezone, date) : null),
    [config, timezone, date]
  );
  const ctx = useMemo(() => ({ t, format }), [t, format]);
  const actions = hubActions(rows, isManager);
  const marker = answer && t("availabilityHub.hub.decides", { date: shortDate(answer.date, ctx) });

  return (
    <>
      <DateCheck date={date} onDateChange={setDate} answer={answer} today={today} />
      <section className={styles.rules}>
        <div>
          <Heading level={2} size={5} id={rulesId}>
            {t("availabilityHub.hub.rulesHeading")}
          </Heading>
          <Text variant="caption" color="secondary">
            {t("availabilityHub.hub.laterRulesWin")}
          </Text>
        </div>
        <ol className={styles.rows} aria-labelledby={rulesId}>
          {hubRowTexts(rows, today, ctx).map((text, index) => (
            <HubRow
              key={text.row}
              text={text}
              action={rowAction(actions[index] ?? null, text.title, t)}
              serviceTo={isManager ? serviceTo : null}
              marker={answer?.hubRow === text.row ? marker : null}
            />
          ))}
        </ol>
      </section>
      <Link to={availabilityPath({ view: "history" })} className={styles.link}>
        {t("availabilityHub.hub.history")}
      </Link>
    </>
  );
}

const serviceTo = (service: string) => availabilityPath({ view: "hours", service });

/** A row's action with its words: "Edit", and "Edit Regular hours" as its name out of context. */
function rowAction(action: HubAction | null, row: string, t: TFunction): HubRowAction | null {
  if (!action) return null;
  const label = t(`availabilityHub.hub.action.${action.kind}`);
  return {
    to: action.to,
    label,
    name: t("availabilityHub.hub.rowAction", { action: label, row }),
  };
}
