import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Drawer, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import { addDays } from "@mbe/availability";
import type { AvailabilityConfigSaveResult, AvailabilityConfigState } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useViewport } from "../../hooks/useViewport.js";
import type { QuickSetupDraft } from "./quick-setup-draft.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
import {
  BlockedReason,
  ConflictReviewPanel,
  OverlapChoice,
  OwnChangesChoice,
  SaveFailure,
  ScheduleDraftGuard,
  useWeekdaySummary,
} from "./ScheduleFormParts.js";
import { DraftPreview } from "./DraftPreview.js";
import { NameSuggestionChip } from "./NameSuggestionChip.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import { useDiscardGuard } from "./use-discard-guard.js";
import { useRegularWeekEdit } from "./use-regular-week-edit.js";
import styles from "./ScheduleFormParts.module.css";

export interface ChangeRegularWeekDrawerProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
  readonly onClose: () => void;
  /** The change was saved, before the drawer closes (the Schedules layer re-seeds its week form). */
  readonly onSaved?: (saved: AvailabilityConfigSaveResult) => void;
  /** Replaces the saved regular week as the draft (Starting later… from the week panel). */
  readonly initialDraft?: QuickSetupDraft;
}

/**
 * Change regular week (ux.md F-UW, S14): the regular week's services, days and different-hours
 * blocks from a start date, until an end date (a named period; then the regular week returns by
 * itself) or with no end (this becomes the regular week, named by nothing). The days the change
 * covers follow the services: a weekday no service runs on is closed, and one the week never ran
 * can be opened. Where a period meets another dated schedule the Manager chooses which wins.
 */
export function ChangeRegularWeekDrawer(props: ChangeRegularWeekDrawerProps) {
  const viewport = useViewport();
  const { venueId, state, today, onStale, onClose, onSaved, initialDraft } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const summarize = useWeekdaySummary();
  const {
    draft,
    edit,
    startsOn,
    setStartsOn,
    endsOn,
    setEndsOn,
    name,
    setName,
    winner,
    setWinner,
    conflictMode,
    setConflictMode,
    saver,
    review,
    dirty,
    weekdays,
    dates,
    own,
    overlaps,
    issues,
    outside,
    closedDays,
    focusDate,
    trimmed,
    block,
    blockedText,
    blocked,
    previewChanges,
    scopeConflicts,
    startText,
    submit,
  } = useRegularWeekEdit({
    venueId,
    state,
    onStale,
    onSaved: (saved) => {
      onSaved?.(saved);
      onClose();
    },
    onGone: onClose,
    initialDraft,
  });
  // Escape, the backdrop and Cancel all ask first while there is something to lose.
  const guard = useDiscardGuard<void>(onClose, dirty);
  const blockedId = useId();

  return (
    <>
      <Drawer
        open
        onClose={() => guard.request()}
        title={t("availabilitySchedules.regularWeek.title")}
        size={viewport === "phone" ? "full" : "wide"}
        footer={
          <div className={styles.footer}>
            <BlockedReason id={blockedId} reason={blockedText} />
            <Button variant="secondary" onClick={() => guard.request()}>
              {t("availabilitySchedules.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={blocked}
              aria-describedby={blocked ? blockedId : undefined}
              isLoading={saver.isPending}
              onClick={() => void submit()}
            >
              {startsOn
                ? t("availabilitySchedules.regularWeek.save", { date: startText })
                : t("availabilitySchedules.save")}
            </Button>
          </div>
        }
      >
        <Stack gap="md">
          {review.review ? (
            <ConflictReviewPanel
              review={review.review}
              onReapply={review.reapply}
              onDiscard={review.discard}
            />
          ) : (
            <SaveFailure messages={saver.failure} stranded={saver.stranded} />
          )}
          <div className={styles.dates}>
            <DatePicker
              label={t("availabilitySchedules.startsOn")}
              value={startsOn}
              min={today}
              max={endsOn ?? undefined}
              onChange={setStartsOn}
            />
            <DatePicker
              label={t("availabilitySchedules.endsOn")}
              placeholder={t("availabilitySchedules.noEnd")}
              value={endsOn}
              min={startsOn ?? today}
              onChange={setEndsOn}
            />
            {endsOn !== null && (
              <Button variant="ghost" size="sm" onClick={() => setEndsOn(null)}>
                {t("availabilitySchedules.noEnd")}
              </Button>
            )}
          </div>
          {/* Most changes start today or tomorrow: one click instead of a calendar. */}
          <div className={styles.dates}>
            {(["today", "tomorrow"] as const).map((when) => {
              const date = when === "today" ? today : addDays(today, 1);
              return (
                <Button
                  key={when}
                  variant="secondary"
                  size="sm"
                  aria-pressed={startsOn === date}
                  onClick={() => setStartsOn(date)}
                >
                  {t(`availabilitySchedules.regularWeek.start.${when}`)}
                </Button>
              );
            })}
          </div>
          {/* With days to name, "This becomes your regular week: open …" below says the same. */}
          {endsOn === null && weekdays.length === 0 && (
            <Text variant="caption" color="secondary">
              {t("availabilitySchedules.regularWeek.noEnd")}
            </Text>
          )}
          {weekdays.length > 0 && (
            <Text variant="caption" color="secondary">
              {t(
                endsOn === null
                  ? "availabilitySchedules.regularWeek.becomes"
                  : "availabilitySchedules.regularWeek.appliesTo",
                { days: summarize(weekdays) }
              )}
            </Text>
          )}
          {endsOn === null && closedDays.length > 0 && (
            <Text variant="caption" color="secondary">
              {t("availabilitySchedules.regularWeek.closedDays", {
                count: closedDays.length,
                days: new Intl.ListFormat(format.locale, { type: "conjunction" }).format(
                  closedDays.map((day) => dayName(day))
                ),
              })}
            </Text>
          )}
          {outside.map((schedule) => (
            <Text key={schedule.name} variant="caption" color="secondary">
              {t("availabilitySchedules.regularWeek.outside", {
                days: summarize(schedule.weekdays),
                name: schedule.name,
              })}
            </Text>
          ))}
          {endsOn !== null && (
            <>
              <Input
                label={t("availabilitySchedules.name")}
                value={name}
                maxLength={60}
                required
                onChange={(e) => setName(e.target.value)}
              />
              <NameSuggestionChip startsOn={startsOn} endsOn={endsOn} name={name} onUse={setName} />
            </>
          )}
          {startsOn && (
            <Text variant="caption" color="secondary">
              {t("availabilitySchedules.impact", { count: dates.length })}
            </Text>
          )}
          <QuickSetupForm draft={draft} onChange={edit} issues={issues} inDrawer />
          <OverlapChoice
            name={trimmed || t("availabilitySchedules.thisSchedule")}
            others={overlaps}
            value={winner}
            onChange={setWinner}
          />
          <OwnChangesChoice
            count={dates.length > 1 ? own.length : 0}
            value={conflictMode}
            onChange={setConflictMode}
          />
          <DraftPreview
            venueId={venueId}
            changes={previewChanges}
            scopeConflicts={scopeConflicts}
            dates={dates}
            focusDate={focusDate}
            baseVersion={review.baselineVersion}
            idle={block === "conflict" ? "conflict" : dirty ? "fields" : "untouched"}
          />
        </Stack>
      </Drawer>
      <ScheduleDraftGuard
        dirty={dirty}
        asking={guard.pending !== null}
        onDiscard={guard.confirmDiscard}
        onKeepEditing={guard.keepEditing}
      />
    </>
  );
}
