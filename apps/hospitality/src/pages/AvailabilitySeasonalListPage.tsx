import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { Button, ConfirmDialog, Skeleton, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, Schedule } from "@mbe/types";
import {
  availabilityPath,
  readAvailabilityAddress,
} from "../components/availability/availability-address.js";
import { compareServiceOptions } from "../components/availability/compare-changes.js";
import { scheduleNameText } from "../components/availability/day-summary.js";
import {
  buildDeleteScheduleChanges,
  isScheduleUnused,
} from "../components/availability/schedule-changes.js";
import { SaveFailure } from "../components/availability/ScheduleFormParts.js";
import { visibleSchedules } from "../components/availability/superseded-schedules.js";
import { useScheduleSave } from "../components/availability/use-schedule-save.js";
import { useUsageText } from "../components/availability/use-usage-text.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import { useAvailabilityScope, type AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { currentServiceDate } from "../utils/current-service-date.js";
import styles from "./AvailabilitySeasonalListPage.module.css";

type Target = Parameters<typeof availabilityPath>[0];

/**
 * `availability/seasonal` (availability-hub ux.md, "Seasonal hours"): each set of seasonal hours
 * with where it applies, Edit, Duplicate and Delete, and the reason a row cannot be deleted as
 * text. The editor and compare screens are built later; their addresses come from the address
 * module, which sends them to today's page until then.
 */
export function AvailabilitySeasonalListPage() {
  const { t } = useTranslation();
  const scope = useAvailabilityScope();
  const { from } = readAvailabilityAddress(useLocation());
  const address = (target: Target) => availabilityPath({ ...target, ...(from && { from }) });
  const { focusAfter } = useFocusAfter();
  useEffect(() => focusAfter({ kind: "pageHeading" }), [focusAfter]);

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("availabilityHub.routes.seasonalHours")}
        aside={
          <div className={styles.links}>
            <Link to={address({ view: "hub" })} className={styles.link}>
              {t("availabilityHub.seasonal.back")}
            </Link>
            {scope.isManager && (
              <Link to={address({ view: "seasonal", screen: "new" })} className={styles.link}>
                {t("availabilityHub.seasonal.add")}
              </Link>
            )}
          </div>
        }
      />
      <SeasonalBody scope={scope} address={address} />
    </div>
  );
}

AvailabilitySeasonalListPage.displayName = "AvailabilitySeasonalListPage";

interface BodyProps {
  readonly scope: AvailabilityScope;
  readonly address: (target: Target) => string;
}

/** Below the header: no venue, the load failure, loading, or the list. */
function SeasonalBody({ scope, address }: BodyProps) {
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
      <div role="status" aria-label={t("availabilityHub.seasonal.loading")}>
        <Skeleton variant="text" lines={4} />
      </div>
    );
  }
  return <SeasonalList venueId={venueId} state={state} scope={scope} address={address} />;
}

interface ListProps extends BodyProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
}

function SeasonalList({ venueId, state, scope, address }: ListProps) {
  const { t } = useTranslation();
  const { config } = state;
  const usage = useUsageText(config);
  const saver = useScheduleSave(scope.refresh);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const serviceDate = useMemo(
    () => currentServiceDate(config, scope.timezone, new Date()),
    [config, scope.timezone]
  );
  const sets = visibleSchedules(config, serviceDate).filter((s) => !s.isRegular);
  const canCompare = compareServiceOptions(config, serviceDate).length > 0;

  const confirmDelete = async () => {
    if (!deleting) return;
    const saved = await saver.save(
      venueId,
      state,
      buildDeleteScheduleChanges(deleting.id),
      "replace"
    );
    if (saved) scope.offerUndo(t("availabilitySchedules.deleted", { name: deleting.name }), saved);
    setDeleting(null);
  };

  return (
    <div className={styles.body}>
      <SaveFailure messages={saver.failure} stranded={saver.stranded} />
      {sets.length === 0 ? (
        <Text variant="body" color="secondary">
          {t("availabilityHub.seasonal.empty")}
        </Text>
      ) : (
        <ul className={styles.list}>
          {sets.map((schedule) => (
            <SeasonalItem
              key={schedule.id}
              schedule={schedule}
              where={usage(schedule)}
              unused={isScheduleUnused(config, schedule.id)}
              inRules={!config.assignments.some((a) => a.scheduleId === schedule.id)}
              editable={scope.isManager}
              address={address}
              onDelete={() => setDeleting(schedule)}
            />
          ))}
        </ul>
      )}
      {canCompare && scope.isManager && (
        <Link to={address({ view: "seasonal", screen: "compare" })} className={styles.link}>
          {t("availabilityHub.seasonal.compare")}
        </Link>
      )}
      <ConfirmDialog
        open={deleting !== null}
        variant="destructive"
        title={t("availabilitySchedules.deleteTitle", { name: deleting?.name ?? "" })}
        description={t("availabilitySchedules.deleteDescription")}
        confirmLabel={t("availabilitySchedules.delete")}
        cancelLabel={t("availabilitySchedules.cancel")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

interface ItemProps {
  readonly schedule: Schedule;
  readonly where: string;
  readonly unused: boolean;
  /** No assignment uses it: whatever blocks Delete is Use schedule rules. */
  readonly inRules: boolean;
  readonly editable: boolean;
  readonly address: (target: Target) => string;
  readonly onDelete: () => void;
}

function SeasonalItem(props: ItemProps) {
  const { schedule, where, unused, inRules, editable, address, onDelete } = props;
  const { t } = useTranslation();
  const reasonId = useId();
  const name = scheduleNameText(schedule.name, t);
  return (
    <li className={styles.item}>
      <div className={styles.name}>
        <Text as="span" variant="body" color="primary">
          {name}
        </Text>
        <Text as="span" variant="caption" color="secondary">
          {where}
        </Text>
      </div>
      {editable && (
        <div className={styles.actions}>
          <Link
            to={address({ view: "seasonal", screen: "edit", scheduleId: schedule.id })}
            className={styles.link}
            aria-label={t("availabilitySchedules.editNamed", { name })}
          >
            {t("availabilitySchedules.edit")}
          </Link>
          <Link
            to={address({ view: "seasonal", screen: "new", copy: schedule.id })}
            className={styles.link}
            aria-label={t("availabilitySchedules.duplicateNamed", { name })}
          >
            {t("availabilitySchedules.duplicate")}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            disabled={!unused}
            aria-describedby={unused ? undefined : reasonId}
            aria-label={t("availabilitySchedules.deleteNamed", { name })}
            onClick={onDelete}
          >
            {t("availabilitySchedules.delete")}
          </Button>
        </div>
      )}
      {editable && !unused && (
        <Text id={reasonId} as="p" variant="caption" color="secondary" className={styles.reason}>
          {t(
            inRules
              ? "availabilityHub.seasonal.cantDeleteRules"
              : "availabilityHub.seasonal.cantDelete",
            {
              where,
            }
          )}
        </Text>
      )}
    </li>
  );
}
