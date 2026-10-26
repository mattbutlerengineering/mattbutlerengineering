import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Checkbox, SegmentedControl, Stack, Text } from "@mattbutlerengineering/rialto";
import type { ScopeConflictMode } from "@mbe/types";
import { addDays } from "@mbe/availability";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { weekdayRuns, type Winner } from "./schedule-changes.js";
import styles from "./ScheduleFormParts.module.css";

/** Monday-first display order of the stored weekday indexes. */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;
/** A known Sunday, so a weekday index plus this date names that weekday in any locale. */
const SUNDAY = "2026-10-25";

/** Short or long weekday name for a stored index (0 = Sunday). */
export function useWeekdayName() {
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
