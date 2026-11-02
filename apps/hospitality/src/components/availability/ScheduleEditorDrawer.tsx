import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Drawer, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ScopeConflictMode } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useViewport } from "../../hooks/useViewport.js";
import { seedServices, servicesEqual, type DraftService } from "./draft-changes.js";
import {
  buildEditScheduleChanges,
  buildNewScheduleChanges,
  overlappingSchedules,
  datesOfUse,
  scheduleSaveBlock,
  type Winner,
} from "./schedule-changes.js";
import { ownChangeDates, scopeDates } from "./scope-dates.js";
import {
  BlockedReason,
  ConflictReviewPanel,
  OverlapChoice,
  OwnChangesChoice,
  SaveFailure,
  ScheduleDraftGuard,
  WeekdayToggles,
} from "./ScheduleFormParts.js";
import { ServicesEditor } from "./ServicesEditor.js";
import { useConflictReview } from "./use-conflict-review.js";
import { useDiscardGuard } from "./use-discard-guard.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./ScheduleFormParts.module.css";

export type ScheduleEditorMode = "new" | "duplicate" | "edit";

export interface ScheduleEditorDrawerProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly mode: ScheduleEditorMode;
  /** The schedule being edited or copied. */
  readonly sourceScheduleId?: string;
  readonly onStale: () => void;
  readonly onClose: () => void;
}

/**
 * New, duplicate and edit for a schedule (ux.md F3). A new or copied schedule also says where it
 * is used (weekdays, optional dates) and settles who wins an overlap; an edit keeps its use and
 * changes the schedule everywhere it runs.
 */
export function ScheduleEditorDrawer(props: ScheduleEditorDrawerProps) {
  const viewport = useViewport();
  const { venueId, state, timezone, today, mode, sourceScheduleId, onStale, onClose } = props;
  const { config } = state;
  const { t } = useTranslation();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);

  const source = config.schedules.find((s) => s.id === sourceScheduleId);
  const [initialName] = useState(() =>
    mode === "edit"
      ? (source?.name ?? "")
      : mode === "duplicate"
        ? t("availabilitySchedules.copyName", { name: source?.name ?? "" })
        : ""
  );
  const [name, setName] = useState(initialName);
  const [services, setServices] = useState<DraftService[]>(() =>
    source
      ? seedServices(config, { services: [] }, { kind: "schedule", scheduleId: source.id })
      : []
  );
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [winner, setWinner] = useState<Winner>("new");
  const [conflictMode, setConflictMode] = useState<ScopeConflictMode>("keep");

  const editing = mode === "edit";
  const review = useConflictReview({
    kind: editing ? "edit" : "draft",
    state,
    scheduleId: sourceScheduleId,
    services,
    name: editing ? name : null,
    conflicted: saver.conflicted,
    clearConflict: saver.clearConflict,
    apply: (next) => {
      setServices(next.services);
      if (next.name !== null) setName(next.name);
    },
    startOver: (rows) => {
      setServices(rows);
      setName(initialName);
      setWeekdays([]);
      setStartsOn(null);
      setEndsOn(null);
      setWinner("new");
      setConflictMode("keep");
    },
    onGone: onClose,
  });
  const dirty =
    name !== (editing ? review.baselineName : initialName) ||
    !servicesEqual(services, review.baselineServices) ||
    weekdays.length > 0 ||
    startsOn !== null ||
    endsOn !== null;
  // Escape, the backdrop and Cancel all ask first while there is something to lose.
  const guard = useDiscardGuard<void>(onClose, dirty);
  const useOn = useMemo(() => ({ weekdays, startsOn, endsOn }), [weekdays, startsOn, endsOn]);
  const dates = useMemo(
    () =>
      editing && sourceScheduleId
        ? scopeDates(
            { kind: "schedule", scheduleId: sourceScheduleId },
            { config, timezone, today }
          )
        : datesOfUse(useOn, today),
    [editing, sourceScheduleId, config, timezone, today, useOn]
  );
  const own = useMemo(() => ownChangeDates(config, dates, null), [config, dates]);
  const overlaps = useMemo(
    () => (editing ? [] : overlappingSchedules(config, useOn).map((s) => s.name)),
    [editing, config, useOn]
  );

  const trimmed = name.trim();
  const block = scheduleSaveBlock({
    conflicted: saver.conflicted,
    name,
    services,
    startsOn,
    endsOn,
  });
  const blockedId = useId();

  const submit = async () => {
    const makeId = () => crypto.randomUUID();
    const changes =
      editing && sourceScheduleId
        ? buildEditScheduleChanges({
            config,
            scheduleId: sourceScheduleId,
            name: trimmed,
            services,
            makeId,
            baseline: review.baseline,
          })
        : buildNewScheduleChanges({ config, name: trimmed, services, useOn, winner, makeId });
    // Checked against the version the draft was built from, so a change made since is a
    // conflict the Manager reviews, not something this save quietly rebases.
    const saved = await saver.save(
      venueId,
      { ...state, version: review.baselineVersion },
      changes,
      dates.length > 1 ? conflictMode : "replace"
    );
    if (!saved) return;
    offerUndo({ venueId, saved, title: t("availabilitySchedules.saved", { name: trimmed }) });
    onClose();
  };

  const title =
    mode === "edit"
      ? t("availabilitySchedules.editTitle", { name: source?.name ?? "" })
      : mode === "duplicate"
        ? t("availabilitySchedules.duplicateTitle")
        : t("availabilitySchedules.newTitle");

  return (
    <>
      <Drawer
        open
        onClose={() => guard.request()}
        title={title}
        size={viewport === "phone" ? "full" : "wide"}
        footer={
          <div className={styles.footer}>
            <BlockedReason
              id={blockedId}
              reason={block && t(`availabilitySchedules.blocked.${block}`)}
            />
            <Button variant="secondary" onClick={() => guard.request()}>
              {t("availabilitySchedules.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={block !== null}
              aria-describedby={block ? blockedId : undefined}
              isLoading={saver.isPending}
              onClick={() => void submit()}
            >
              {t("availabilitySchedules.save")}
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
          <Input
            label={t("availabilitySchedules.name")}
            value={name}
            maxLength={60}
            required
            onChange={(e) => setName(e.target.value)}
          />
          {!editing && (
            <>
              <WeekdayToggles
                legend={t("availabilitySchedules.useOn")}
                value={weekdays}
                onChange={setWeekdays}
              />
              <div className={styles.dates}>
                <DatePicker
                  label={t("availabilitySchedules.startsOn")}
                  placeholder={t("availabilitySchedules.noStart")}
                  value={startsOn}
                  max={endsOn ?? undefined}
                  onChange={setStartsOn}
                />
                <DatePicker
                  label={t("availabilitySchedules.endsOn")}
                  placeholder={t("availabilitySchedules.noEnd")}
                  value={endsOn}
                  min={startsOn ?? undefined}
                  onChange={setEndsOn}
                />
                {endsOn !== null && (
                  <Button variant="ghost" size="sm" onClick={() => setEndsOn(null)}>
                    {t("availabilitySchedules.noEnd")}
                  </Button>
                )}
              </div>
            </>
          )}
          <Text variant="caption" color="secondary">
            {weekdays.length === 0 && !editing
              ? t("availabilitySchedules.impactNone")
              : t("availabilitySchedules.impact", { count: dates.length })}
          </Text>
          <ServicesEditor
            services={services}
            venueServices={config.venueServices}
            onChange={setServices}
          />
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
