import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  DatePicker,
  Select,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
} from "@mattbutlerengineering/rialto";
import { weekdayIndexOf, type ResolvedDay } from "@mbe/availability";
import {
  AvailabilityConfigProblemSchema,
  type AvailabilityChangeSummary,
  type AvailabilityConfigSaveResult,
  type AvailabilityConfigState,
  type ConflictChangesSince,
  type ScopeConflictMode,
  type StrandedReservation,
} from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useViewport } from "../../hooks/useViewport.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { AvailabilityGuestPreview } from "./AvailabilityGuestPreview.js";
import { ConflictDialog } from "./ConflictDialog.js";
import { keepParked, parkedName, switchScope, type ParkedEdit } from "./scope-switch.js";
import {
  buildDraftChanges,
  overnightHintDate,
  seedServices,
  servicesEqual,
  type DraftService,
  type EditScope,
} from "./draft-changes.js";
import { waitingProps } from "./draft-wait.js";
import { markEditorOpen } from "./editor-open.js";
import { ownChangeDates, scheduleReach, scopeDates } from "./scope-dates.js";
import type { SeriesScope } from "./series-edit.js";
import { BlockedReason } from "./ScheduleFormParts.js";
import { nextServiceRow, ServicesEditor } from "./ServicesEditor.js";
import { StrandedBookings } from "./StrandedBookings.js";
import { namedServiceHoursText } from "./service-hours.js";
import { scheduleNameText } from "./day-summary.js";
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
  /** The editor is done: `saved` is true after a save, false when the draft was discarded. */
  readonly onFinished: (saved: boolean) => void;
  /** Dates picked in the multi-select bar: the edit applies to exactly these, with no scope choice. */
  readonly fixedDates?: readonly string[];
  /** A range or repeating special-hours rule is being edited (F-SER); its scope is already chosen. */
  readonly ruleScope?: { readonly ruleId: string; readonly mode: SeriesScope };
  /** Reload the config: a refused save or a discarded draft leaves the cells and version behind. */
  readonly onStale?: () => void;
  /** Editing must not start yet: the config on hand is behind the Manager's own last save. */
  readonly held?: boolean;
  /** The element that says why editing is held. */
  readonly heldReasonId?: string;
}

interface EditState {
  /**
   * The config the draft was made against. It follows reloads until the first change; from then
   * on a refetch must not move the version a save is checked against, or the compare-and-set
   * would stop catching someone else's change.
   */
  readonly base: AvailabilityConfigState;
  readonly scope: EditScope;
  readonly services: DraftService[];
  /** The rows the draft started from; the draft is dirty while it differs. */
  readonly baseline: DraftService[];
  /** Edits to services the scope showing now lacks; they return with a scope that has them. */
  readonly parked: ParkedEdit[];
  /** Services whose edits the scope showing now will not save, named in a line under the scope. */
  readonly unsaved: string[];
  readonly overridden: string[];
  readonly mode: ScopeConflictMode;
}

interface Failure {
  readonly messages: string[];
  /** The bookings behind a stranded refusal. */
  readonly stranded?: readonly StrandedReservation[];
}

/** Something to save: the rows differ from where this scope started. */
const isDirty = (edit: EditState | null): boolean =>
  edit !== null && !servicesEqual(edit.services, edit.baseline);

/** Something to lose: a save, or an edit held for a scope that has the service. */
const holdsEdits = (edit: EditState | null): boolean =>
  edit !== null && (isDirty(edit) || edit.parked.length > 0);

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
  const { onDirtyChange, onCancel, onFinished, onStale, fixedDates, ruleScope } = props;
  const { held = false, heldReasonId } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const phone = useViewport() === "phone";
  const offerUndo = useAvailabilityUndo();
  const { mutateAsync, isPending } = useSaveAvailabilityConfig();
  const choiceLabelId = useId();
  const saveBlockId = useId();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // `seen` is the version the 409 reported, read by the server just before the change it names, so
  // Overwrite goes against what the dialog shows. Absent from an older server: no Overwrite then.
  const [conflict, setConflict] = useState<{
    readonly winningChange: AvailabilityChangeSummary | null;
    readonly changesSince?: ConflictChangesSince;
    readonly seen: number | null;
    readonly again: boolean;
  } | null>(null);

  // Nothing to lose yet, so a reload simply replaces what the editor shows and will save against.
  // `day` is resolved from `state` by the caller, so the two rows and the version stay in step.
  if (edit && !holdsEdits(edit) && edit.base.version !== state.version) {
    const seed = seedServices(state.config, day, edit.scope);
    setEdit({ ...edit, base: state, services: seed, baseline: seed, unsaved: [], overridden: [] });
  }

  const { config } = edit?.base ?? state;
  const scope = edit?.scope;
  const dates = useMemo(
    () => (scope ? scopeDates(scope, { config, timezone, today }) : []),
    [scope, config, timezone, today]
  );
  // A schedule edit is checked by the save against every booking, so its preview reaches the
  // dates a use_schedule rule sends to the schedule too, and checks from today like the save.
  const scheduleId = scope?.kind === "schedule" ? scope.scheduleId : null;
  const previewDates = useMemo(
    () => (scheduleId ? scheduleReach(scheduleId, { config, timezone, today }) : dates),
    [scheduleId, config, timezone, today, dates]
  );
  const own = useMemo(
    () => ownChangeDates(config, dates, scope?.kind === "rule" ? scope.ruleId : null),
    [config, dates, scope]
  );
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
      today,
    });
  }, [edit, config, today]);
  // Under Keep theirs the dates with their own changes are left alone, so they are not written.
  // The count is what the change reaches, the same dates the preview lists: for a schedule that
  // includes the dates a use_schedule rule sends to it. `dates` still decides the conflict mode and
  // which dates have their own changes.
  const writtenCount =
    edit?.mode === "keep" && dates.length > 1
      ? previewDates.length - own.length
      : previewDates.length;
  // A rule edit goes through the server's keep/replace for its dates that have their own change.
  const conflictMode: ScopeConflictMode =
    ruleScope || dates.length > 1 ? (edit?.mode ?? "keep") : "replace";
  const schedule = config.schedules.find((s) => s.id === day.scheduleId);

  const nameList = (names: readonly string[]) =>
    new Intl.ListFormat(format.locale, { type: "conjunction" }).format(names);

  const update = (next: EditState) => {
    setEdit(next);
    onDirtyChange(holdsEdits(next));
  };

  // From the first edit until the editor goes, other saves (Copy, the nudge, Undo) wait: they
  // would move the version this draft will be saved against.
  const releaseOpenRef = useRef<(() => void) | null>(null);
  // Which row takes focus once the editor is up: its button is gone by then.
  const focusRowRef = useRef<number | "new" | null>(null);
  const servicesRef = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      releaseOpenRef.current?.();
      releaseOpenRef.current = null;
    },
    []
  );

  const begin = (addService = false, row = 0) => {
    if (held) return;
    releaseOpenRef.current ??= markEditorOpen();
    const first: EditScope = fixedDates
      ? { kind: "dates", dates: fixedDates }
      : ruleScope
        ? { kind: "rule", ...ruleScope, from: date }
        : { kind: "date", date };
    const seed = seedServices(config, day, first);
    focusRowRef.current = addService ? "new" : row;
    update({
      base: state,
      scope: first,
      // "+ Add service" adds one: the Manager asked for a row, not for the editor around it.
      services: addService ? [...seed, nextServiceRow(seed, config)] : seed,
      baseline: seed,
      parked: [],
      unsaved: [],
      overridden: [],
      mode: "keep",
    });
  };

  // The button that opened the editor is gone, so focus goes to the row it was about.
  useEffect(() => {
    const target = focusRowRef.current;
    if (target === null) return;
    focusRowRef.current = null;
    const rows = servicesRef.current?.querySelectorAll("fieldset");
    if (!rows) return;
    const row = target === "new" ? rows[rows.length - 1] : (rows[target] ?? rows[0]);
    row?.querySelector("input")?.focus();
  }, [edit]);

  const chooseScope = (kind: string) => {
    if (!edit) return;
    const next: EditScope =
      kind === "weekday"
        ? { kind, from: date, until: null }
        : kind === "regularWeekday" && schedule?.isRegular
          ? { kind, weekday: weekdayIndexOf(date) }
          : kind === "schedule" && schedule
            ? { kind, scheduleId: schedule.id }
            : { kind: "date", date };
    const seed = seedServices(config, day, next);
    // Before anything is edited the rows follow the scope. A draft is laid over the rows of the
    // scope it lands in, never carried across as it is: a save into the schedule removes every
    // stored row the draft lacks, and a date's own rule would take the schedule's rows as its own.
    if (!holdsEdits(edit)) {
      update({
        ...edit,
        scope: next,
        services: seed,
        baseline: seed,
        parked: [],
        unsaved: [],
        overridden: [],
      });
      return;
    }
    const moved = switchScope({
      baseline: edit.baseline,
      services: edit.services,
      parked: edit.parked,
      seed,
    });
    update({ ...edit, ...moved, scope: next });
  };

  const submit = async (overwrite: boolean) => {
    if (!edit) return;
    // Overwrite goes against the version the dialog showed, never one read at click time.
    const expectedVersion = overwrite ? conflict?.seen : edit.base.version;
    if (expectedVersion === null || expectedVersion === undefined) return;
    setFailure(null);
    const changes = buildDraftChanges({
      config,
      scope: edit.scope,
      services: edit.services,
      makeId: () => crypto.randomUUID(),
      // A rule edit leaves its own-change dates to the server's keep/replace.
      leaveOut: edit.mode === "keep" && dates.length > 1 && !ruleScope ? own : [],
      today,
    });
    let saved: AvailabilityConfigSaveResult;
    try {
      saved = await mutateAsync({
        venueId,
        body: {
          expectedVersion,
          changes,
          // A single date is an explicit choice; there is nothing to keep or replace.
          scopeConflicts: conflictMode,
        },
      });
    } catch (error) {
      rejectSave(error, overwrite);
      return;
    }
    offerUndo({
      venueId,
      saved,
      title:
        previewDates.length > 1 || (scheduleId !== null && previewDates[0] !== date)
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
    onFinished(true);
  };

  const rejectSave = (error: unknown, overwrote: boolean) => {
    const problem = problemOf(error);
    if (problem?.code === "version-conflict") {
      setConflict({
        winningChange: problem.winningChange ?? null,
        ...(problem.changesSince ? { changesSince: problem.changesSince } : {}),
        seen: problem.currentVersion ?? null,
        again: overwrote,
      });
      // Someone else's change is in; reload so the calendar and the next edit see it.
      onStale?.();
    } else if (problem?.code === "invalid-config" && problem.issues?.length) {
      setFailure({ messages: problem.issues.map((i) => i.message) });
    } else if (problem?.code === "stranded-bookings") {
      setFailure({
        messages: [
          t(ruleScope ? "availability.editor.strandedRule" : "availability.editor.stranded", {
            count: problem.reservations?.length ?? 0,
          }),
        ],
        stranded: problem.reservations ?? [],
      });
    } else {
      setFailure({ messages: [describeApiError(error).detail] });
    }
  };

  const discardMine = () => {
    setConflict(null);
    onDirtyChange(false);
    onStale?.();
    onFinished(false);
  };

  if (!edit) {
    return (
      <Stack gap="sm">
        <ul className={styles.services}>
          {day.services.map((service, row) => (
            <li key={service.venueServiceId} className={styles.service}>
              <Text as="span" variant="body" color="primary" className={styles.serviceLine}>
                {namedServiceHoursText(service.name, service, { t, format })}
              </Text>
              <Button
                variant="secondary"
                size="sm"
                {...waitingProps(held, heldReasonId)}
                onClick={() => begin(false, row)}
              >
                {t("availability.editor.edit", { name: service.name })}
              </Button>
            </li>
          ))}
        </ul>
        <div>
          <Button
            variant="secondary"
            size="sm"
            {...waitingProps(held, heldReasonId)}
            onClick={() => begin(true)}
          >
            {t("availability.editor.addService")}
          </Button>
        </div>
      </Stack>
    );
  }

  const nameless = edit.services.some((s) => s.venueServiceId === null && !s.name.trim());
  const saveBlock = nameless
    ? t("availability.editor.blocked.serviceName")
    : !isDirty(edit)
      ? t("availability.editor.blocked.noChange")
      : previewDates.length === 0
        ? t("availability.editor.blocked.noDates")
        : writtenCount === 0
          ? t("availability.editor.blocked.keptOwn")
          : null;
  const scopeOptions = [
    { value: "date", label: t("availability.editor.scope.date") },
    {
      value: "weekday",
      label: t("availability.editor.scope.weekday", {
        weekday: format.formatCalendarDate(date, { weekday: "long" }),
        date: format.formatCalendarDate(date, { month: "short", day: "numeric" }),
      }),
    },
    // A day on the regular week: that weekday of it, in place. A superseded version (an older
    // week a later one has replaced) is nobody's to edit from here.
    ...(schedule?.isRegular
      ? [
          {
            value: "regularWeekday",
            label: t("availability.editor.scope.regularWeekday", {
              weekday: format.formatCalendarDate(date, { weekday: "long" }),
            }),
          },
        ]
      : schedule && schedule.kind !== "regular"
        ? [
            {
              value: "schedule",
              label: t("availability.editor.scope.schedule", {
                name: scheduleNameText(schedule.name, t),
              }),
            },
          ]
        : []),
  ];

  const fields = (
    <>
      {!fixedDates && !ruleScope && (
        <Select
          label={t("availability.editor.scope.label")}
          options={scopeOptions}
          value={edit.scope.kind}
          onChange={chooseScope}
        />
      )}
      {(edit.unsaved.length > 0 || edit.overridden.length > 0) && (
        <div role="status">
          {edit.unsaved.length > 0 && (
            <Text variant="caption" color="secondary">
              {t("availability.editor.held", {
                count: edit.unsaved.length,
                names: nameList(edit.unsaved),
              })}
            </Text>
          )}
          {edit.overridden.length > 0 && (
            <Text variant="caption" color="secondary">
              {t("availability.editor.overridden", {
                count: edit.overridden.length,
                names: nameList(edit.overridden),
              })}
            </Text>
          )}
        </div>
      )}
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
        {t("availability.editor.scopeCount", { count: previewDates.length })}
      </Text>
      <div ref={servicesRef}>
        <ServicesEditor
          services={edit.services}
          config={config}
          date={overnightHintDate(edit.scope, date, dates)}
          onChange={(services) => {
            // A name leaves the lines only with the hold it names: one dropped because its service
            // was added back, or its row removed here. Editing another row changes neither.
            const parked = keepParked(edit.parked, services, edit.baseline);
            const held = new Set(parked.map(parkedName));
            update({
              ...edit,
              services,
              parked,
              overridden: edit.overridden.filter((name) => held.has(name)),
              unsaved: edit.unsaved.filter((name) => held.has(name)),
            });
          }}
        />
      </div>
    </>
  );
  // A scope that reaches no dates has nothing to preview; the server refuses an empty scope.
  const preview =
    previewChanges && previewDates.length > 0 ? (
      <AvailabilityGuestPreview
        venueId={venueId}
        changes={previewChanges}
        scopeConflicts={conflictMode}
        dates={previewDates}
        scope={scheduleId ? { from: today } : undefined}
        focusDate={date}
      />
    ) : null;
  const choice =
    dates.length > 1 && own.length > 0 ? (
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
    ) : null;

  return (
    <Stack gap="md">
      {failure && !conflict && (
        <>
          <Alert variant="error" title={t("availability.editor.saveError")}>
            {failure.messages.map((message) => (
              <Text key={message} variant="body" color="primary">
                {message}
              </Text>
            ))}
          </Alert>
          {/* Outside the alert, which would read every row aloud. */}
          <StrandedBookings reservations={failure.stranded ?? []} />
        </>
      )}
      {/* On a phone the preview is a tab of its own, so the drawer is not one long scroll. */}
      {phone ? (
        <Tabs
          aria-label={t("availability.editor.tabsLabel")}
          tabs={[
            {
              id: "edit",
              label: t("availability.editor.tabEdit"),
              content: (
                <Stack gap="md">
                  {fields}
                  {choice}
                </Stack>
              ),
            },
            {
              id: "preview",
              label: t("availability.editor.tabPreview"),
              // Disabled, not removed, so the Edit panel keeps its place in the tree and the
              // field being typed in is not remounted when the draft first becomes previewable.
              disabled: !preview,
              content: preview ?? (
                <Text variant="caption" color="secondary">
                  {t("availability.editor.previewEmpty")}
                </Text>
              ),
            },
          ]}
        />
      ) : (
        <>
          {fields}
          {preview}
          {choice}
        </>
      )}
      <BlockedReason id={saveBlockId} reason={saveBlock} />
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          {t("availability.editor.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={saveBlock !== null}
          aria-describedby={saveBlock ? saveBlockId : undefined}
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
          {...(conflict.changesSince ? { changesSince: conflict.changesSince } : {})}
          services={edit.services}
          isSaving={isPending}
          failure={failure?.messages ?? []}
          stranded={failure?.stranded ?? []}
          ready={conflict.seen !== null}
          changedAgain={conflict.again}
          onOverwrite={() => void submit(true)}
          onDiscard={discardMine}
          onBack={() => setConflict(null)}
        />
      )}
    </Stack>
  );
}
