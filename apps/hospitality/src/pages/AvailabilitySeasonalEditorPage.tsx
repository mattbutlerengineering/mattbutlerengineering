import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Skeleton, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import {
  availabilityPath,
  readAvailabilityAddress,
  readSeasonalCopy,
} from "../components/availability/availability-address.js";
import { SeasonalHoursEditor } from "../components/availability/SeasonalHoursEditor.js";
import type { ScheduleEditorMode } from "../components/availability/use-schedule-editor.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import { useAvailabilityConfig } from "../hooks/useAvailability.js";
import { useAvailabilityScope, type AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { describeApiError } from "../lib/describe-api-error.js";
import styles from "./AvailabilitySeasonalListPage.module.css";

interface Opening {
  readonly mode: ScheduleEditorMode;
  readonly sourceScheduleId?: string;
  /** The set being edited, for the title once a colleague has deleted it. */
  readonly name?: string;
}

/** A schedule a Manager can edit or copy: seasonal hours, never the regular week or a retired set. */
const findSet = (state: AvailabilityConfigState | null, id: string | null) =>
  id
    ? state?.config.schedules.find((s) => s.id === id && !s.isRegular && !s.archivedAt)
    : undefined;

/**
 * How the editor opens: `:scheduleId` edits that set (`null` when it is not there), `new?copy=`
 * starts as a copy of it, and a bare `new` starts from the regular week.
 */
function openingFor(
  state: AvailabilityConfigState,
  scheduleId: string | undefined,
  copy: string | null
): Opening | null {
  if (scheduleId) {
    const set = findSet(state, scheduleId);
    return set ? { mode: "edit", sourceScheduleId: scheduleId, name: set.name } : null;
  }
  const source = findSet(state, copy);
  return source ? { mode: "duplicate", sourceScheduleId: source.id } : { mode: "new" };
}

/**
 * `availability/seasonal/new` (with `?copy=<scheduleId>`) and `availability/seasonal/:scheduleId`
 * (availability-hub ux.md, "Seasonal hours"): the form for one set of seasonal hours. A save
 * returns to the list, with Undo on offer from the layout. Managers only; the route sends a Host
 * to the hub.
 */
export function AvailabilitySeasonalEditorPage() {
  const { t } = useTranslation();
  const scope = useAvailabilityScope();
  const location = useLocation();
  const { scheduleId } = useParams();
  const { from } = readAvailabilityAddress(location);
  const list = availabilityPath({ view: "seasonal", ...(from && { from }) });
  const { focusAfter } = useFocusAfter();
  useEffect(() => focusAfter({ kind: "pageHeading" }), [focusAfter]);
  const config = useAvailabilityConfig({ venueId: scope.venueId });
  const refreshError = config.data && config.error ? describeApiError(config.error).detail : null;
  const copy = readSeasonalCopy(location);
  const scheduleKey = `${scope.venueId}:${scheduleId ?? copy ?? "new"}`;
  const found = scope.state ? openingFor(scope.state, scheduleId, copy) : null;
  // Once the editor has opened it stays open: a set a colleague deletes mid-edit is the editor's
  // to say (its conflict review), with the draft still there. "Not found" is for the first load.
  const [latched, setLatched] = useState<{ key: string; opening: Opening } | null>(null);
  if (found && latched?.key !== scheduleKey) setLatched({ key: scheduleKey, opening: found });
  const opening = latched?.key === scheduleKey ? latched.opening : found;
  const title =
    opening?.mode === "edit"
      ? t("availabilitySchedules.editTitle", { name: opening.name ?? "" })
      : opening?.mode === "duplicate"
        ? t("availabilityHub.seasonalEditor.duplicateTitle")
        : t("availabilityHub.seasonalEditor.newTitle");

  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        aside={
          <div className={styles.links}>
            <Link to={list} className={styles.link}>
              {t("availabilityHub.seasonalEditor.back")}
            </Link>
          </div>
        }
      />
      <EditorBody
        scope={scope}
        opening={opening}
        list={list}
        scheduleKey={scheduleKey}
        refreshError={refreshError}
      />
    </div>
  );
}

AvailabilitySeasonalEditorPage.displayName = "AvailabilitySeasonalEditorPage";

interface BodyProps {
  readonly scope: AvailabilityScope;
  readonly opening: Opening | null;
  readonly list: string;
  readonly scheduleKey: string;
  readonly refreshError: string | null;
}

/** Below the header: no venue, the load failure, loading, a set that is gone, or the form. */
function EditorBody({ scope, opening, list, scheduleKey, refreshError }: BodyProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { venueId, state, load, loadError, refresh, today, timezone, offerUndo } = scope;
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
      <div role="status" aria-label={t("availabilityHub.seasonalEditor.loading")}>
        <Skeleton variant="text" lines={4} />
      </div>
    );
  }
  if (opening === null) {
    return (
      <Text variant="body" color="secondary">
        {t("availabilityHub.seasonalEditor.notFound")}
      </Text>
    );
  }
  return (
    <SeasonalHoursEditor
      // A new set, a copy and an edit each start fresh, and so does another venue.
      key={scheduleKey}
      venueId={venueId}
      state={state}
      timezone={timezone}
      today={today}
      mode={opening.mode}
      {...(opening.sourceScheduleId && { sourceScheduleId: opening.sourceScheduleId })}
      {...(opening.mode === "new" && { seed: "regular" as const })}
      onStale={refresh}
      offerUndo={offerUndo}
      refreshError={refreshError}
      onDone={() => void navigate(list, { replace: true })}
    />
  );
}
