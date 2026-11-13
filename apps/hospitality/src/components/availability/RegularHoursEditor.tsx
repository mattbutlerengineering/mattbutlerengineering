import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DatePicker, Stack, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigSaveResult, AvailabilityConfigState } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { DraftPreview } from "./DraftPreview.js";
import { EditorSaveBar } from "./EditorSaveBar.js";
import { draftRows, FormConflictDialog } from "./FormConflictDialog.js";
import { LeaveGuard } from "./LeaveGuard.js";
import type { QuickSetupDraft } from "./quick-setup-draft.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
import { previewOverlapReason } from "./quick-setup-validate.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import { SaveFailure, useWeekdaySummary } from "./ScheduleFormParts.js";
import { useRegularHoursDraft } from "./use-regular-hours-draft.js";
import styles from "./RegularHoursEditor.module.css";

export interface RegularHoursEditorProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
  /** The refresh of the config failed, as the page words it; a conflict being reviewed says so. */
  readonly refreshError: string | null;
  /** `?service=`: the venue service to open on arrival; the first service when it names none. */
  readonly service: string | null;
  readonly offerUndo: (title: string, saved: AvailabilityConfigSaveResult) => void;
  /** Saved from the save bar: the page returns to the hub. */
  readonly onSaved: (saved: AvailabilityConfigSaveResult) => void;
}

/**
 * Regular hours' form (availability-hub ux.md, "Regular hours"): Starting, the services as lines
 * with one open, the shared days and the guest preview, and the save bar as the next Tab stop
 * after the open service. The form restarts from the saved hours when they move under it with
 * nothing to lose (a colleague's save, Undo), and after Discard. Mounted per venue (the page keys
 * it), so nothing here outlives a venue switch.
 */
export function RegularHoursEditor(props: RegularHoursEditorProps) {
  const { state } = props;
  const [seed, setSeed] = useState({ version: state.version, epoch: 0 });
  const [status, setStatus] = useState({ dirty: false, reviewing: false });
  const restart = () => {
    setSeed((was) => ({ version: state.version, epoch: was.epoch + 1 }));
    setStatus({ dirty: false, reviewing: false });
  };
  if (state.version !== seed.version && !status.dirty && !status.reviewing) restart();
  return <EditorBody key={seed.epoch} {...props} onDiscard={restart} onStatus={setStatus} />;
}

interface BodyProps extends RegularHoursEditorProps {
  readonly onDiscard: () => void;
  readonly onStatus: (status: { readonly dirty: boolean; readonly reviewing: boolean }) => void;
}

/** The service to open: the one `?service=` names, matched by name as the draft holds it. */
function openServiceId(
  state: AvailabilityConfigState,
  draft: QuickSetupDraft,
  service: string | null
) {
  const name = state.config.venueServices
    .find((s) => s.id === service)
    ?.name.trim()
    .toLowerCase();
  const named = draft.services.find((s) => s.name.trim().toLowerCase() === name);
  return (named ?? draft.services[0])?.id ?? null;
}

function EditorBody(props: BodyProps) {
  const { venueId, state, today, onStale, refreshError, onDiscard } = props;
  const { t } = useTranslation();
  const draft = useRegularHoursDraft({ ...props, onDiscard });
  const reviewing = draft.review.review !== null;
  const { onStatus } = props;
  const { dirty } = draft;
  // The parent decides whether a new version restarts the form, so it hears what there is to lose.
  useEffect(() => {
    onStatus({ dirty, reviewing });
  }, [dirty, reviewing, onStatus]);
  const [initialOpenId] = useState(() => openServiceId(state, draft.draft, props.service));

  const bar = (
    <EditorSaveBar
      dirty={draft.unsaved}
      saving={draft.saver.isPending}
      reach={draft.reach}
      hasProblem={draft.hasProblem}
      blockedReason={draft.blockedReason}
      specialHours={{
        count: draft.dates.length > 1 ? draft.own.length : 0,
        value: draft.conflictMode,
        onChange: draft.setConflictMode,
      }}
      onSave={draft.save}
      onDiscard={onDiscard}
      onRefused={draft.save}
    />
  );
  return (
    <div className={styles.editor} data-testid="week-panel">
      {/* Wide enough, the draft's notes and guest preview sit beside the form, so the form after
          an edit fits 1.5 screens (PRD 7); the form's column is the same width before and after. */}
      <div className={styles.layout}>
        <Stack gap="md">
          <StartingField today={today} startsOn={draft.startsOn} onChange={draft.setStartsOn} />
          {!reviewing && (
            <SaveFailure messages={draft.saver.failure} stranded={draft.saver.stranded} />
          )}
          <div onBlur={draft.leftBlock}>
            <QuickSetupForm
              draft={draft.draft}
              onChange={draft.edit}
              issues={draft.shown}
              idScope={draft.scopeId}
              storedKept={draft.storedKept}
              collapsible
              initialOpenId={initialOpenId}
              afterOpenService={bar}
              // One preview: while the draft is dirty the draft preview beside it stands in for it.
              hidePreview={draft.dirty}
            />
          </div>
        </Stack>
        {draft.dirty && (
          <Stack gap="md" className={styles.aside}>
            <DirtyNotes venueId={venueId} draft={draft} />
          </Stack>
        )}
      </div>
      <Stack gap="md">
        <FormConflictDialog
          saver={draft.saver}
          review={draft.review.review}
          rows={draftRows(draft.draft)}
          reloadError={refreshError}
          onReload={onStale}
          onReapply={draft.review.reapply}
          onStartOver={draft.review.discard}
          onDiscard={onDiscard}
        />
        <LeaveGuard
          active={draft.guarded}
          date={null}
          title={t("availabilitySchedules.discard.title")}
          onSave={draft.saveAndLeave}
        />
      </Stack>
    </div>
  );
}

interface StartingFieldProps {
  readonly today: string;
  readonly startsOn: string | null;
  readonly onChange: (date: string) => void;
}

/** "Starting": today until another date is picked; the line under it says what that means. */
function StartingField({ today, startsOn, onChange }: StartingFieldProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const start = startsOn ?? today;
  const date = format.formatCalendarDate(start, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div className={styles.starting}>
      <DatePicker
        label={t("availabilityHub.hours.starting")}
        value={start}
        min={today}
        locale={format.locale}
        // Clearing the field goes back to today: regular hours always start somewhere.
        onChange={(next) => onChange(next ?? today)}
      />
      <Text variant="caption" color="secondary">
        {start === today
          ? t("availabilityHub.hours.appliesToday")
          : t("availabilityHub.hours.appliesFrom", { date })}
      </Text>
    </div>
  );
}

/** While dirty: what the week becomes, the days it closes, and the guest preview of the draft. */
function DirtyNotes({
  venueId,
  draft,
}: {
  readonly venueId: string;
  readonly draft: ReturnType<typeof useRegularHoursDraft>;
}) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const summarize = useWeekdaySummary();
  const list = (days: readonly number[]) =>
    new Intl.ListFormat(format.locale, { type: "conjunction" }).format(days.map((d) => dayName(d)));
  return (
    <>
      {draft.weekdays.length > 0 && (
        <Text variant="caption" color="secondary">
          {t("availabilitySchedules.regularWeek.becomes", { days: summarize(draft.weekdays) })}
        </Text>
      )}
      {draft.closedDays.length > 0 && (
        <Text variant="caption" color="secondary">
          {t("availabilitySchedules.regularWeek.closedDays", {
            count: draft.closedDays.length,
            days: list(draft.closedDays),
          })}
        </Text>
      )}
      {draft.outside.map((schedule) => (
        <Text key={schedule.name} variant="caption" color="secondary">
          {t("availabilitySchedules.regularWeek.outside", {
            days: summarize(schedule.weekdays),
            name: schedule.name,
          })}
        </Text>
      ))}
      <DraftPreview
        venueId={venueId}
        changes={draft.previewChanges}
        scopeConflicts={draft.scopeConflicts}
        dates={draft.dates}
        focusDate={draft.focusDate}
        baseVersion={draft.review.baselineVersion}
        idle={draft.block === "conflict" ? "conflict" : draft.quiet ? "quiet" : "fields"}
        fieldsReason={previewOverlapReason(draft.shown, draft.draft, t, (day) => dayName(day))}
      />
    </>
  );
}
