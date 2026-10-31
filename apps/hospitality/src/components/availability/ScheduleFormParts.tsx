import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Checkbox,
  SegmentedControl,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { ScopeConflictMode } from "@mbe/types";
import { addDays } from "@mbe/availability";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";
import { LeaveGuard } from "./LeaveGuard.js";
import { weekdayRuns, type Winner } from "./schedule-changes.js";
import type { ConflictReview } from "./use-conflict-review.js";
import styles from "./ScheduleFormParts.module.css";

/** Monday-first display order of the stored weekday indexes. */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;
/** A known Sunday, so a weekday index plus this date names that weekday in any locale. */
const SUNDAY = "2026-10-25";

/** Short or long weekday name for a stored index (0 = Sunday). */
function useWeekdayName() {
  const format = useVenueFormat();
  return (weekday: number, width: "short" | "long" = "short") =>
    format.formatCalendarDate(addDays(SUNDAY, weekday), { weekday: width });
}

/** "Mon–Thu", "Sat–Sun, Wed", or "every day". */
export function useWeekdaySummary() {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const name = useWeekdayName();
  return (weekdays: readonly number[]) => {
    if (weekdays.length === 7) return t("availabilitySchedules.everyDay");
    const runs = weekdayRuns(weekdays).map(([a, b]) =>
      a === b ? name(a) : `${name(a)}–${name(b)}`
    );
    return new Intl.ListFormat(format.locale, { type: "conjunction" }).format(runs);
  };
}

/** Seven weekday checkboxes, Monday first. */
export function WeekdayToggles(props: {
  readonly legend: string;
  readonly value: readonly number[];
  readonly onChange: (weekdays: number[]) => void;
}) {
  const { legend, value, onChange } = props;
  const name = useWeekdayName();
  return (
    <fieldset className={styles.days}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.dayRow}>
        {MONDAY_FIRST.map((day) => (
          <Checkbox
            key={day}
            label={name(day)}
            checked={value.includes(day)}
            onCheckedChange={(on) =>
              onChange(on ? [...value, day] : value.filter((d) => d !== day))
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

/** "Summer hours overlaps Patio season. Summer wins / Patio season wins" (F-UW step 4). */
export function OverlapChoice(props: {
  readonly name: string;
  readonly others: readonly string[];
  readonly value: Winner;
  readonly onChange: (winner: Winner) => void;
}) {
  const { name, others, value, onChange } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const labelId = useId();
  if (others.length === 0) return null;
  const other = new Intl.ListFormat(format.locale, { type: "conjunction" }).format(others);
  return (
    <Stack gap="xs">
      <Text variant="body" color="primary" id={labelId}>
        {t("availabilitySchedules.overlap", { name, other })}
      </Text>
      <SegmentedControl
        aria-labelledby={labelId}
        segments={[
          { id: "new", label: t("availabilitySchedules.overlapNewWins", { name }) },
          {
            id: "existing",
            label: t("availabilitySchedules.overlapExistingWins", { name: other }),
          },
        ]}
        value={value}
        onChange={(id) => onChange(id as Winner)}
      />
    </Stack>
  );
}

/** "3 dates already have their own changes: Keep theirs / Replace them" (F2 step 4). */
export function OwnChangesChoice(props: {
  readonly count: number;
  readonly value: ScopeConflictMode;
  readonly onChange: (mode: ScopeConflictMode) => void;
}) {
  const { count, value, onChange } = props;
  const { t } = useTranslation();
  const labelId = useId();
  if (count === 0) return null;
  return (
    <Stack gap="xs">
      <Text variant="body" color="primary" id={labelId}>
        {t("availabilitySchedules.ownChanges", { count })}
      </Text>
      <SegmentedControl
        aria-labelledby={labelId}
        segments={[
          { id: "keep", label: t("availabilitySchedules.keepTheirs") },
          { id: "replace", label: t("availabilitySchedules.replaceThem") },
        ]}
        value={value}
        onChange={(mode) => onChange(mode as ScopeConflictMode)}
      />
    </Stack>
  );
}

/**
 * After a lost race: what the other person changed in this schedule, and the two ways on. Saving
 * stays off until the Manager picks one, because the draft was built from a version that is gone.
 */
export function ConflictReviewPanel(props: {
  readonly review: ConflictReview;
  readonly onReapply: () => void;
  readonly onDiscard: () => void;
}) {
  const { review, onReapply, onDiscard } = props;
  const { loaded, changes } = review;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const list = (names: readonly string[]) =>
    new Intl.ListFormat(format.locale, { type: "conjunction" }).format(names);
  const lines = [
    changes.renamedTo !== null &&
      t("availabilitySchedules.conflictReview.renamed", { name: changes.renamedTo }),
    changes.added.length > 0 &&
      t("availabilitySchedules.conflictReview.added", { names: list(changes.added) }),
    changes.removed.length > 0 &&
      t("availabilitySchedules.conflictReview.removed", { names: list(changes.removed) }),
    changes.changed.length > 0 &&
      t("availabilitySchedules.conflictReview.changed", { names: list(changes.changed) }),
  ].filter((line): line is string => line !== false);

  return (
    <Alert
      variant="warning"
      title={t("availabilitySchedules.conflictReview.title")}
      actions={
        <Stack direction="row" gap="sm">
          <Button
            variant="primary"
            size="sm"
            disabled={!loaded || changes.gone}
            onClick={onReapply}
          >
            {t("availabilitySchedules.conflictReview.reapply")}
          </Button>
          <Button variant="secondary" size="sm" onClick={onDiscard}>
            {t("availabilitySchedules.conflictReview.discard")}
          </Button>
        </Stack>
      }
    >
      {!loaded ? (
        <Text variant="body" color="primary">
          {t("availabilitySchedules.conflictReview.loading")}
        </Text>
      ) : changes.gone ? (
        <Text variant="body" color="primary">
          {t("availabilitySchedules.conflictReview.gone")}
        </Text>
      ) : (
        <>
          {lines.length === 0 ? (
            <Text variant="body" color="primary">
              {t("availabilitySchedules.conflictReview.nothing")}
            </Text>
          ) : (
            lines.map((line) => (
              <Text key={line} variant="body" color="primary">
                {line}
              </Text>
            ))
          )}
          <Text variant="caption" color="secondary">
            {t("availabilitySchedules.conflictReview.hint")}
          </Text>
        </>
      )}
    </Alert>
  );
}

/** Asks before Escape, the backdrop, Cancel or leaving the page throws away an unsaved schedule draft. */
export function ScheduleDraftGuard(props: {
  readonly dirty: boolean;
  readonly asking: boolean;
  readonly onDiscard: () => void;
  readonly onKeepEditing: () => void;
}) {
  const { t } = useTranslation();
  const title = t("availabilitySchedules.discard.title");
  return (
    <>
      <DiscardChangesDialog
        open={props.asking}
        date={null}
        title={title}
        onDiscard={props.onDiscard}
        onKeepEditing={props.onKeepEditing}
      />
      <LeaveGuard active={props.dirty} date={null} title={title} />
    </>
  );
}

/** The failure `Alert` the Schedules surfaces share. */
export function SaveFailure(props: { readonly messages: readonly string[] }) {
  const { t } = useTranslation();
  if (props.messages.length === 0) return null;
  return (
    <Alert variant="error" title={t("availabilitySchedules.saveError")}>
      {props.messages.map((message) => (
        <Text key={message} variant="body" color="primary">
          {message}
        </Text>
      ))}
    </Alert>
  );
}
