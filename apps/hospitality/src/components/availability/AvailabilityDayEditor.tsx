import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  DatePicker,
  Select,
  SegmentedControl,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { ResolvedDay } from "@mbe/availability";
import {
  AvailabilityConfigProblemSchema,
  type AvailabilityChangeSummary,
  type AvailabilityConfigSaveResult,
  type AvailabilityConfigState,
  type ScopeConflictMode,
} from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { AvailabilityGuestPreview } from "./AvailabilityGuestPreview.js";
import { ConflictDialog } from "./ConflictDialog.js";
import {
  buildDraftChanges,
  seedServices,
  servicesEqual,
  type DraftService,
  type EditScope,
} from "./draft-changes.js";
import { ownChangeDates, scopeDates } from "./scope-dates.js";
import { ServicesEditor } from "./ServicesEditor.js";
import { minuteText } from "./closure-band.js";
import styles from "./AvailabilityDayEditor.module.css";

export interface AvailabilityDayEditorProps {
  readonly venueId: string;
  readonly date: string;
  readonly day: ResolvedDay;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  /** Called from event handlers whenever the draft starts or stops differing from the saved day. */
  readonly onDirtyChange: (dirty: boolean) => void;
  /** Cancel; the drawer decides whether unsaved edits need a discard prompt first. */
  readonly onCancel: () => void;
  /** The draft was saved or thrown away; the drawer closes without a prompt. */
  readonly onFinished: () => void;
}

interface EditState {
  /**
   * The config the draft was made against. A background refetch must not move the version a
   * save is checked against, or the compare-and-set would stop catching someone else's change.
   */
  readonly base: AvailabilityConfigState;
  readonly scope: EditScope;
  readonly services: DraftService[];
  /** The rows the draft started from; the draft is dirty while it differs. */
  readonly baseline: DraftService[];
  readonly mode: ScopeConflictMode;
}

interface Failure {
  readonly messages: string[];
}

const isDirty = (edit: EditState | null): boolean =>
  edit !== null && !servicesEqual(edit.services, edit.baseline);

function problemOf(error: unknown) {
  const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
  const parsed = AvailabilityConfigProblemSchema.safeParse(details);
  return parsed.success ? parsed.data : null;
}

/**
 * The editing half of the day drawer (ux.md F2): a read-mode list of services, and on the first
 * edit a scope select chosen before anything changes, the services editor, keep/replace for dates
 * with their own changes, and a save that names how many dates it writes. Manager-only; the
 * drawer never mounts it for a Host.
 */
export function AvailabilityDayEditor(props: AvailabilityDayEditorProps) {
  const { venueId, date, day, state, timezone, today } = props;
  const { onDirtyChange, onCancel, onFinished } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const offerUndo = useAvailabilityUndo();
  const { mutateAsync, isPending } = useSaveAvailabilityConfig();
  const choiceLabelId = useId();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [conflict, setConflict] = useState<{
    readonly winningChange: AvailabilityChangeSummary | null;
  } | null>(null);

  const { config } = edit?.base ?? state;
  const scope = edit?.scope;
  const dates = useMemo(
    () => (scope ? scopeDates(scope, { config, timezone, today }) : []),
    [scope, config, timezone, today]
  );
  const own = useMemo(() => ownChangeDates(config, dates, null), [config, dates]);
  // The preview only needs the shape of the rows, so its new-row ids need not be real ones.
  const previewChanges = useMemo(() => {
    if (!edit || !isDirty(edit)) return null;
    // A new service with no name yet fails the server's schema: hold the preview until it has one.
    if (edit.services.some((s) => s.venueServiceId === null && !s.name.trim())) return null;
    let n = 0;
    return buildDraftChanges({
      config,
      scope: edit.scope,
      services: edit.services,
      makeId: () => `preview-${n++}`,
    });
  }, [edit, config]);
  // Under Keep theirs the dates with their own changes are left alone, so they are not written.
  const writtenCount =
    edit?.mode === "keep" && dates.length > 1 ? dates.length - own.length : dates.length;
  const schedule = config.schedules.find((s) => s.id === day.scheduleId);
  const scheduleCount = config.schedules.filter((s) => !s.archivedAt).length;

  const update = (next: EditState) => {
    setEdit(next);
    onDirtyChange(isDirty(next));
  };

  const begin = () => {
    const seed = seedServices(config, day, { kind: "date", date });
    setEdit({
      base: state,
      scope: { kind: "date", date },
      services: seed,
      baseline: seed,
      mode: "keep",
    });
  };

  const chooseScope = (kind: string) => {
    if (!edit) return;
    const next: EditScope =
      kind === "weekday"
        ? { kind, from: date, until: null }
        : kind === "schedule" && schedule
          ? { kind, scheduleId: schedule.id }
          : { kind: "date", date };
    // Before anything is edited the rows follow the scope; after, the draft is kept as it is.
    const seed = isDirty(edit) ? null : seedServices(config, day, next);
    update({
      ...edit,
      scope: next,
      ...(seed ? { services: seed, baseline: seed } : {}),
    });
  };

  const submit = async (overwrite: boolean) => {
    if (!edit) return;
    setFailure(null);
    const changes = buildDraftChanges({
      config,
      scope: edit.scope,
      services: edit.services,
      makeId: () => crypto.randomUUID(),
    });
    let saved: AvailabilityConfigSaveResult;
    try {
      saved = await mutateAsync({
        venueId,
        overwrite,
        body: {
          expectedVersion: edit.base.version,
          changes,
          // A single date is an explicit choice; there is nothing to keep or replace.
          scopeConflicts: dates.length > 1 ? edit.mode : "replace",
        },
      });
    } catch (error) {
      rejectSave(error);
      return;
    }
    offerUndo({
      venueId,
      saved,
      title:
        dates.length > 1
          ? t("availability.editor.savedMany", { count: writtenCount })
          : t("availability.editor.savedOne", {
              date: format.formatCalendarDate(date, {
                weekday: "long",
                month: "long",
                day: "numeric",
              }),
            }),
    });
    setConflict(null);
    onFinished();
  };

  const rejectSave = (error: unknown) => {
    const problem = problemOf(error);
    if (problem?.code === "version-conflict") {
      setConflict({ winningChange: problem.winningChange ?? null });
    } else if (problem?.code === "invalid-config" && problem.issues?.length) {
      setFailure({ messages: problem.issues.map((i) => i.message) });
    } else if (problem?.code === "stranded-bookings") {
      setFailure({
        messages: [t("availability.editor.stranded", { count: problem.reservations?.length ?? 0 })],
      });
    } else {
      setFailure({ messages: [describeApiError(error).detail] });
    }
  };

  const discardMine = () => {
    setConflict(null);
    onDirtyChange(false);
    onFinished();
  };

  if (!edit) {
    return (
      <Stack gap="sm">
        <ul className={styles.services}>
          {day.services.map((service) => (
            <li key={service.venueServiceId} className={styles.service}>
              <Text as="span" variant="body" color="primary">
                {t("availability.editor.serviceLine", {
                  name: service.name,
                  from: minuteText(service.opensAt, t, format),
                  to: minuteText(service.closesAt, t, format),
                })}
              </Text>
              <Button variant="ghost" size="sm" onClick={begin}>
                {t("availability.editor.edit", { name: service.name })}
              </Button>
            </li>
          ))}
        </ul>
        <div>
          <Button variant="secondary" size="sm" onClick={begin}>
            {t("availability.editor.addService")}
          </Button>
        </div>
      </Stack>
    );
  }

  const nameless = edit.services.some((s) => s.venueServiceId === null && !s.name.trim());
  const scopeOptions = [
    { value: "date", label: t("availability.editor.scope.date") },
    {
      value: "weekday",
      label: t("availability.editor.scope.weekday", {
        weekday: format.formatCalendarDate(date, { weekday: "long" }),
        date: format.formatCalendarDate(date, { month: "short", day: "numeric" }),
      }),
    },
    ...(schedule
      ? [
          {
            value: "schedule",
            label:
              scheduleCount > 1
                ? t("availability.editor.scope.schedule", { name: schedule.name })
                : t("availability.editor.scope.regularWeek"),
          },
        ]
      : []),
  ];

  return (
    <Stack gap="md">
      {failure && (
        <Alert variant="error" title={t("availability.editor.saveError")}>
          {failure.messages.map((message) => (
            <Text key={message} variant="body" color="primary">
              {message}
            </Text>
          ))}
        </Alert>
      )}
      <Select
        label={t("availability.editor.scope.label")}
        options={scopeOptions}
        value={edit.scope.kind}
        onChange={chooseScope}
      />
      {edit.scope.kind === "weekday" && (
        <div className={styles.until}>
          <DatePicker
            label={t("availability.editor.until")}
            placeholder={t("availability.editor.noEnd")}
            value={edit.scope.until}
            min={edit.scope.from}
            onChange={(until) => update({ ...edit, scope: { ...edit.scope, until } as EditScope })}
          />
          {edit.scope.until !== null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                update({ ...edit, scope: { ...edit.scope, until: null } as EditScope })
              }
            >
              {t("availability.editor.noEnd")}
            </Button>
          )}
        </div>
      )}
      <Text variant="caption" color="secondary">
        {t("availability.editor.scopeCount", { count: dates.length })}
      </Text>
      <ServicesEditor
        services={edit.services}
        venueServices={config.venueServices}
        date={date}
        onChange={(services) => update({ ...edit, services })}
      />
      {previewChanges && (
        <AvailabilityGuestPreview
          venueId={venueId}
          changes={previewChanges}
          scopeConflicts={dates.length > 1 ? edit.mode : "replace"}
          dates={dates}
          focusDate={date}
        />
      )}
      {dates.length > 1 && own.length > 0 && (
        <Stack gap="xs">
          <Text variant="body" color="primary" id={choiceLabelId}>
            {t("availability.editor.ownChanges", { count: own.length })}
          </Text>
          <SegmentedControl
            aria-labelledby={choiceLabelId}
            segments={[
              { id: "keep", label: t("availability.editor.keepTheirs") },
              { id: "replace", label: t("availability.editor.replaceThem") },
            ]}
            value={edit.mode}
            onChange={(mode) => update({ ...edit, mode: mode as ScopeConflictMode })}
          />
        </Stack>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          {t("availability.editor.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!isDirty(edit) || nameless}
          isLoading={isPending && !conflict}
          onClick={() => void submit(false)}
        >
          {t("availability.editor.save", { count: writtenCount })}
        </Button>
      </div>
      {conflict && (
        <ConflictDialog
          open
          winningChange={conflict.winningChange}
          services={edit.services}
          isSaving={isPending}
          onOverwrite={() => void submit(true)}
          onDiscard={discardMine}
        />
      )}
    </Stack>
  );
}
