import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  ConfirmDialog,
  DisabledTooltip,
  Heading,
  Stack,
  Tag,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, Schedule } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { CompareServices } from "./CompareServices.js";
import { buildDeleteScheduleChanges, isScheduleUnused } from "./schedule-changes.js";
import { ScheduleEditorDrawer, type ScheduleEditorMode } from "./ScheduleEditorDrawer.js";
import { SaveFailure, useWeekdaySummary } from "./ScheduleFormParts.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./SchedulesTab.module.css";

export interface SchedulesTabProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
}

/** Where a schedule applies, in words: "Mon–Thu", "Jun 1 – Sep 15, every day", or none yet. */
function useUsageText(state: AvailabilityConfigState) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const summary = useWeekdaySummary();
  const day = (date: string) => format.formatCalendarDate(date, { month: "short", day: "numeric" });
  return (schedule: Schedule): string => {
    const uses = state.config.assignments.filter((a) => a.scheduleId === schedule.id);
    if (uses.length === 0) return t("availabilitySchedules.notUsed");
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
 * The Schedules tab (ux.md F3, S5): each schedule and where it applies, with New, Duplicate, Edit
 * and Delete (only for a schedule used nowhere), plus Compare services.
 */
export function SchedulesTab(props: SchedulesTabProps) {
  const { venueId, state, timezone, today, onStale } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const usage = useUsageText(state);
  const saver = useScheduleSave(onStale);
  const [editor, setEditor] = useState<{ mode: ScheduleEditorMode; sourceId?: string } | null>(
    null
  );
  const [comparing, setComparing] = useState(false);
  const [deleting, setDeleting] = useState<Schedule | null>(null);

  const schedules = state.config.schedules.filter((s) => !s.archivedAt);

  const confirmDelete = async () => {
    if (!deleting) return;
    const ok = await saver.save(venueId, state, buildDeleteScheduleChanges(deleting.id), "replace");
    if (ok)
      toast({
        variant: "success",
        title: t("availabilitySchedules.deleted", { name: deleting.name }),
      });
    setDeleting(null);
  };

  return (
    <Stack gap="md">
      <div className={styles.header}>
        <Heading level={2} size={3}>
          {t("availabilitySchedules.title")}
        </Heading>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setComparing((open) => !open)}>
            {t("availabilitySchedules.compare.open")}
          </Button>
          <Button variant="primary" onClick={() => setEditor({ mode: "new" })}>
            {t("availabilitySchedules.new")}
          </Button>
        </div>
      </div>
      <SaveFailure messages={saver.failure} />
      <ul className={styles.list}>
        {schedules.map((schedule) => {
          const unused = isScheduleUnused(state.config, schedule.id);
          const where = usage(schedule);
          return (
            <li key={schedule.id} className={styles.item}>
              <div className={styles.name}>
                <Text as="span" variant="body" color="primary">
                  {schedule.name}
                </Text>
                {schedule.isRegular && <Tag>{t("availabilitySchedules.regularMarker")}</Tag>}
                <Text as="span" variant="caption" color="secondary">
                  {where}
                </Text>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditor({ mode: "edit", sourceId: schedule.id })}
                >
                  {t("availabilitySchedules.editNamed", { name: schedule.name })}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditor({ mode: "duplicate", sourceId: schedule.id })}
                >
                  {t("availabilitySchedules.duplicateNamed", { name: schedule.name })}
                </Button>
                {!schedule.isRegular && (
                  <DisabledTooltip
                    disabled={!unused}
                    disabledReason={t("availabilitySchedules.deleteBlocked", { where })}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!unused}
                      onClick={() => setDeleting(schedule)}
                    >
                      {t("availabilitySchedules.deleteNamed", { name: schedule.name })}
                    </Button>
                  </DisabledTooltip>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {comparing && (
        <section aria-labelledby="compare-services">
          <Heading level={3} size={4} id="compare-services">
            {t("availabilitySchedules.compare.title")}
          </Heading>
          <CompareServices
            venueId={venueId}
            state={state}
            timezone={timezone}
            today={today}
            onStale={onStale}
          />
        </section>
      )}
      {editor && (
        <ScheduleEditorDrawer
          venueId={venueId}
          state={state}
          timezone={timezone}
          today={today}
          mode={editor.mode}
          {...(editor.sourceId ? { sourceScheduleId: editor.sourceId } : {})}
          onStale={onStale}
          onClose={() => setEditor(null)}
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
