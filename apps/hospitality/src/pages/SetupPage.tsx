import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig } from "@mbe/types";
import { useAvailabilityConfig } from "../hooks/useAvailability.js";
import { useFloorPlans, useVenueFloorPlanSections } from "../hooks/useFloorPlans.js";
import { useIsManager } from "../hooks/useIsManager.js";
import { useNow } from "../hooks/useNow.js";
import { useTables } from "../hooks/useTables.js";
import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
import { useVenue } from "../contexts/VenueContext.js";
import { venueDate } from "../utils/service-day.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { PageHeader } from "../components/PageHeader.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { BookingRulesDrawer } from "../components/availability/BookingRulesDrawer.js";
import { ChangeRegularWeekDrawer } from "../components/availability/ChangeRegularWeekDrawer.js";
import { RegularWeekLine } from "../components/availability/RegularWeekLine.js";
import { availabilityPath } from "../components/availability/availability-entry.js";
import { SetupGroupSection } from "../components/venue-setup/SetupGroupSection.js";
import { SetupProgressStrip } from "../components/venue-setup/SetupProgressStrip.js";
import {
  buildSetupTree,
  type GroupLoad,
  type SetupAction,
  type SetupNode,
} from "../components/venue-setup/setup-tree.js";
import styles from "../components/venue-setup/VenueSetup.module.css";

const EMPTY_CONFIG: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

interface Read<T> {
  readonly data: T | undefined;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly refetch: () => Promise<unknown>;
}

/** A group's state from its reads: a failed first read fails the group; stale data stays shown. */
function groupLoad<T>(reads: readonly Read<unknown>[], data: () => T): GroupLoad<T> {
  const failed = reads.find((r) => r.data === undefined && r.error !== null);
  if (failed?.error) return { status: "error", error: failed.error };
  if (reads.some((r) => r.data === undefined)) return { status: "loading" };
  return { status: "ready", data: data() };
}

type Dialog = "bookingRules" | "changeRegularWeek" | null;

/**
 * Venue Setup (`/setup`): every resource type the venue is made of, how they nest, whether each is
 * set up, and the one door to its editor. It composes reads the app already makes into a tree
 * (`buildSetupTree`) and renders it; it edits nothing itself. Standing for every venue: before
 * launch it also shows the launch steps.
 */
export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isManager = useIsManager();
  const readiness = useVenueReadiness();
  const { selectedVenue, selectedVenueId } = useVenue();
  const now = useNow();
  const timeZone = selectedVenue?.ianaTimezone ?? "";
  const today = venueDate(now, timeZone);
  const [dialog, setDialog] = useState<Dialog>(null);

  const config = useAvailabilityConfig({ venueId: selectedVenueId });
  const plans = useFloorPlans({ venueId: selectedVenueId });
  const sections = useVenueFloorPlanSections({ venueId: selectedVenueId });
  const tables = useTables({ venueId: selectedVenueId ?? undefined, activeOnly: true });
  const settings = selectedVenue?.settings ?? null;

  const openReads: readonly Read<unknown>[] = [config];
  const sitReads: readonly Read<unknown>[] = [plans, sections, tables];
  const tree = buildSetupTree({
    venueName: selectedVenue?.name ?? t("setup.hub.yourVenue"),
    isManager,
    readiness: readiness.status === "operational" ? "operational" : "setup",
    today,
    open: groupLoad(openReads, () => ({ config: config.data?.config ?? EMPTY_CONFIG, settings })),
    sit: groupLoad(sitReads, () => ({
      floorPlans: plans.data ?? [],
      sections: sections.data ?? [],
      tables: tables.data ?? [],
    })),
  });
  const [open, sit] = tree.groups;
  const retry = (reads: readonly Read<unknown>[]) => () => {
    reads.forEach((r) => void r.refetch());
  };

  const savedConfig = config.data;
  const renderExtra = useMemo(
    () =>
      savedConfig
        ? (node: SetupNode): ReactNode =>
            node.kind === "schedules" && node.state.kind === "count" ? (
              <RegularWeekLine config={savedConfig.config} timeZone={timeZone} now={now} />
            ) : null
        : undefined,
    [savedConfig, timeZone, now]
  );

  const onAction = (action: SetupAction) => {
    if (action.target.kind === "link") {
      navigate(action.target.to);
      return;
    }
    setDialog(action.target.dialog);
  };

  const bothFailed = open.load.status === "error" && sit.load.status === "error";
  const showStrip = isManager && readiness.status === "setup";

  return (
    <div className={styles.root}>
      <PageHeader title={t("setup.hub.title")} description={t("setup.hub.description")} />
      {showStrip && <SetupProgressStrip readiness={readiness} />}
      <Text as="p" variant="label" color="secondary" className={styles.venueName}>
        {tree.venueName}
      </Text>

      {bothFailed ? (
        <ErrorRetryBanner
          title={t("setup.hub.loadError")}
          error={describeApiError(open.load.error).detail}
          details={describeApiError(open.load.error).raw}
          onRetry={retry([...openReads, ...sitReads])}
        />
      ) : (
        <>
          <SetupGroupSection
            group={open}
            isManager={isManager}
            onAction={onAction}
            onRetry={retry(openReads)}
            renderExtra={renderExtra}
          />
          <SetupGroupSection
            group={sit}
            isManager={isManager}
            onAction={onAction}
            onRetry={retry(sitReads)}
          />
        </>
      )}

      {dialog === "bookingRules" && <BookingRulesDrawer onClose={() => setDialog(null)} />}
      {dialog === "changeRegularWeek" && selectedVenueId && savedConfig && (
        <ChangeRegularWeekDrawer
          venueId={selectedVenueId}
          state={savedConfig}
          today={today}
          onStale={() => void config.refetch()}
          onClose={() => setDialog(null)}
          onOpenSchedules={() => navigate(availabilityPath({ tab: "schedules", from: "setup" }))}
        />
      )}
    </div>
  );
}
