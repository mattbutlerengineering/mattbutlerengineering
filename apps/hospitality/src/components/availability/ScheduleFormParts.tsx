import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Alert, SegmentedControl, Stack, Text } from "@mattbutlerengineering/rialto";
import type { ScopeConflictMode, StrandedReservation } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";
import { LeaveGuard } from "./LeaveGuard.js";
import { type Winner } from "./schedule-changes.js";
import { StrandedBookings } from "./StrandedBookings.js";
import { weekdaySummary } from "./weekday-summary.js";
import styles from "./ScheduleFormParts.module.css";

/** "Mon–Thu", "Wed and Sat–Sun", or "every day". */
export function useWeekdaySummary() {
  const { t } = useTranslation();
  const format = useVenueFormat();
  return (weekdays: readonly number[]) => weekdaySummary(weekdays, format, t);
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

/** The failure `Alert` the Schedules surfaces share; `stranded` lists the bookings behind one. */
export function SaveFailure(props: {
  readonly messages: readonly string[];
  readonly stranded?: readonly StrandedReservation[];
}) {
  const { t } = useTranslation();
  if (props.messages.length === 0) return null;
  return (
    <>
      <Alert variant="error" title={t("availabilitySchedules.saveError")}>
        {props.messages.map((message) => (
          <Text key={message} variant="body" color="primary">
            {message}
          </Text>
        ))}
      </Alert>
      {/* Outside the alert, which would read every row aloud. */}
      <StrandedBookings reservations={props.stranded ?? []} />
    </>
  );
}

/** Why a Save is off, said where the Save is: a disabled button cannot say it for itself. */
export function BlockedReason(props: { readonly id?: string; readonly reason: string | null }) {
  if (props.reason === null) return null;
  return (
    <Text id={props.id} variant="caption" color="secondary" className={styles.blocked}>
      {props.reason}
    </Text>
  );
}
