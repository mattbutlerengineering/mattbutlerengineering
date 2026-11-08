import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  ConfirmDialog,
  DisabledTooltip,
  Heading,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, Schedule } from "@mbe/types";
import { useVenue } from "../../contexts/VenueContext.js";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { bookingRulesOf, bookingRulesText } from "./booking-rules.js";
import { ChangeRegularWeekDrawer } from "./ChangeRegularWeekDrawer.js";
import { CompareServices } from "./CompareServices.js";
import { scheduleNameText } from "./day-summary.js";
import { buildDeleteScheduleChanges, isScheduleUnused } from "./schedule-changes.js";
import type { QuickSetupDraft } from "./quick-setup-draft.js";
import { RegularWeekPanel } from "./RegularWeekPanel.js";
import type { ScheduleEditorMode } from "./ScheduleEditorDrawer.js";
import { SaveFailure, ScheduleDraftGuard, useWeekdaySummary } from "./ScheduleFormParts.js";
import { useDiscardGuard } from "./use-discard-guard.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./SchedulesTab.module.css";

export interface SchedulesTabProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
  /** The week panel or Compare services has edits that are not saved; the page asks before another layer drops them. */
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** Opens the schedule editor, which the page renders (the header ⋯ and the day drawer open it too). */
  readonly onEditorChange: (editor: ScheduleEditorTarget) => void;
  /** Compare services is open (the page's ⋯ menu opens it). */
  readonly comparing: boolean;
  readonly onComparingChange: (comparing: boolean) => void;
}

export interface ScheduleEditorTarget {
  readonly mode: ScheduleEditorMode;
  readonly sourceId?: string;
  /** Add a schedule…: new, seeded from the regular week. */
  readonly seed?: "regular";
}

/** The heading the page moves focus to once quick setup's save has landed. */
export const REGULAR_WEEK_HEADING_ID = "availability-regular-week-heading";

/**
 * Where a schedule applies, in words: "Mon–Thu", "Jun 1 – Sep 15, every day", the Use schedule
 * rules that point at it, or none yet.
 */
function useUsageText(state: AvailabilityConfigState) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const summary = useWeekdaySummary();
  const day = (date: string) => format.formatCalendarDate(date, { month: "short", day: "numeric" });
  return (schedule: Schedule): string => {
    const uses = state.config.assignments.filter((a) => a.scheduleId === schedule.id);
    if (uses.length === 0) {
      const rules = state.config.dateRules.filter(
        (r) => r.kind === "use_schedule" && r.useScheduleId === schedule.id
      ).length;
      return rules > 0
        ? t("availabilitySchedules.usedByRules", { count: rules })
        : t("availabilitySchedules.notUsed");
    }
    return uses
      .map((a) => {
        const days = summary(a.weekdays);
        if (a.startsOn && a.endsOn)
          return t("availabilitySchedules.usageRange", {
            from: day(a.startsOn),
            to: day(a.endsOn),
            days,
          });
        if (a.startsOn)
          return t("availabilitySchedules.usageFrom", { from: day(a.startsOn), days });
        if (a.endsOn) return t("availabilitySchedules.usageUntil", { to: day(a.endsOn), days });
        return days;
      })
      .join("; ");
  };
}

/**
 * The Schedules layer (ux.md S-Avail2): the regular week as an editable form with its guest
 * preview, the other schedules and where they apply (Edit, Duplicate, Delete), the Booking line
 * and, when asked for, Compare services.
 */
export function SchedulesTab(props: SchedulesTabProps) {
  const { venueId, state, timezone, today, onStale, onDirtyChange } = props;
  const { onEditorChange, comparing, onComparingChange } = props;
  const { t } = useTranslation();
  const { selectedVenue } = useVenue();
  const offerUndo = useAvailabilityUndo();
  const usage = useUsageText(state);
  const saver = useScheduleSave(onStale);
  const [compareDirty, setCompareDirty] = useState(false);
  const [weekDirty, setWeekDirty] = useState(false);
  // Starting later…: Change regular week opens carrying the week form's draft.
  const [startingLater, setStartingLater] = useState<QuickSetupDraft | null>(null);
  // Closing Change regular week hands the draft over to it, so the form starts again from the saved week.
  const [panelKey, setPanelKey] = useState(0);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  useEffect(() => {
    onDirtyChange?.(weekDirty || compareDirty);
  }, [weekDirty, compareDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  // Closing Compare throws away rows edited but not saved, so it asks first.
  const compareGuard = useDiscardGuard<void>(() => {
    onComparingChange(false);
    setCompareDirty(false);
  }, compareDirty);

  const others = state.config.schedules.filter((s) => !s.archivedAt && !s.isRegular);
  const rules = bookingRulesText(bookingRulesOf(selectedVenue?.settings), t);

  const confirmDelete = async () => {
    if (!deleting) return;
    const saved = await saver.save(
      venueId,
      state,
      buildDeleteScheduleChanges(deleting.id),
      "replace"
    );
    if (saved) {
      offerUndo({
        venueId,
        saved,
        title: t("availabilitySchedules.deleted", { name: deleting.name }),
      });
    }
    setDeleting(null);
  };

  return (
    <Stack gap="md">
      <div className={styles.header}>
        <Heading level={2} size={3} id={REGULAR_WEEK_HEADING_ID} tabIndex={-1}>
          {t("availabilitySchedules.layer.regularWeek")}
        </Heading>
        <Button variant="secondary" onClick={() => onEditorChange({ mode: "new", seed: "regular" })}>
          {t("availabilitySchedules.layer.add")}
        </Button>
      </div>
      <Text variant="body" color="secondary">
        {t("availabilitySchedules.layer.intro")}
      </Text>
      <RegularWeekPanel
        key={panelKey}
        venueId={venueId}
        state={state}
        today={today}
        onStale={onStale}
        onStartLater={setStartingLater}
        onDirtyChange={setWeekDirty}
      />
      <SaveFailure messages={saver.failure} stranded={saver.stranded} />
      {others.length > 0 && (
        <section aria-labelledby="other-schedules">
          <Stack gap="sm">
            <Heading level={2} size={3} id="other-schedules">
              {t("availabilitySchedules.layer.other")}
            </Heading>
            <ul className={styles.list}>
              {others.map((schedule) => {
                const unused = isScheduleUnused(state.config, schedule.id);
                const where = usage(schedule);
                const shown = scheduleNameText(schedule.name, t);
                return (
                  <li key={schedule.id} className={styles.item}>
                    <div className={styles.name}>
                      <Text as="span" variant="body" color="primary">
                        {shown}
                      </Text>
                      <Text as="span" variant="caption" color="secondary">
                        {where}
                      </Text>
                    </div>
                    <div className={styles.actions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("availabilitySchedules.editNamed", { name: shown })}
                        onClick={() => onEditorChange({ mode: "edit", sourceId: schedule.id })}
                      >
                        {t("availabilitySchedules.edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("availabilitySchedules.duplicateNamed", { name: shown })}
                        onClick={() => onEditorChange({ mode: "duplicate", sourceId: schedule.id })}
                      >
                        {t("availabilitySchedules.duplicate")}
                      </Button>
                      <DisabledTooltip
                        disabled={!unused}
                        disabledReason={
                          state.config.assignments.some((a) => a.scheduleId === schedule.id)
                            ? t("availabilitySchedules.deleteBlocked", { where })
                            : t("availabilitySchedules.deleteBlockedRules", { where })
                        }
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!unused}
                          aria-label={t("availabilitySchedules.deleteNamed", { name: shown })}
                          onClick={() => setDeleting(schedule)}
                        >
                          {t("availabilitySchedules.delete")}
                        </Button>
                      </DisabledTooltip>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Stack>
        </section>
      )}
      {comparing && (
        <section aria-labelledby="compare-services">
          <div className={styles.header}>
            <Heading level={2} size={3} id="compare-services">
              {t("availabilitySchedules.compare.title")}
            </Heading>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (compareDirty ? compareGuard.request() : onComparingChange(false))}
            >
              {t("availabilitySchedules.layer.closeCompare")}
            </Button>
          </div>
          <CompareServices
            venueId={venueId}
            state={state}
            timezone={timezone}
            today={today}
            onStale={onStale}
            onDirtyChange={setCompareDirty}
            onEditSchedule={(sourceId) => onEditorChange({ mode: "edit", sourceId })}
          />
        </section>
      )}
      <Text variant="body" color="secondary">
        {rules === ""
          ? t("availabilitySchedules.layer.bookingUnset")
          : t("availabilitySchedules.layer.booking", { rules })}
      </Text>
      <ScheduleDraftGuard
        dirty={compareDirty}
        asking={compareGuard.pending !== null}
        onDiscard={compareGuard.confirmDiscard}
        onKeepEditing={compareGuard.keepEditing}
      />
      {startingLater && (
        <ChangeRegularWeekDrawer
          venueId={venueId}
          state={state}
          today={today}
          onStale={onStale}
          initialDraft={startingLater}
          onClose={() => {
            setStartingLater(null);
            setPanelKey((n) => n + 1);
          }}
        />
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
    </Stack>
  );
}
