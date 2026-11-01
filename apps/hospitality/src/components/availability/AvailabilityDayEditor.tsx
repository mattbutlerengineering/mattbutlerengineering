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
import { useViewport } from "../../hooks/useViewport.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { AvailabilityGuestPreview } from "./AvailabilityGuestPreview.js";
import { ConflictDialog } from "./ConflictDialog.js";
import { switchScope, type ParkedEdit } from "./scope-switch.js";
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
import { ownChangeDates, scopeDates } from "./scope-dates.js";
import type { SeriesScope } from "./series-edit.js";
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

  const [edit, setEdit] = useState<EditState | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [conflict, setConflict] = useState<{
    readonly winningChange: AvailabilityChangeSummary | null;
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
  const writtenCount =
    edit?.mode === "keep" && dates.length > 1 ? dates.length - own.length : dates.length;
  // A rule edit goes through the server's keep/replace for its dates that have their own change.
  const conflictMode: ScopeConflictMode =
    ruleScope || dates.length > 1 ? (edit?.mode ?? "keep") : "replace";
  const schedule = config.schedules.find((s) => s.id === day.scheduleId);
  const scheduleCount = config.schedules.filter((s) => !s.archivedAt).length;

  const nameList = (names: readonly string[]) =>
    new Intl.ListFormat(format.locale, { type: "conjunction" }).format(names);

  const update = (next: EditState) => {
    setEdit(next);
    onDirtyChange(holdsEdits(next));
  };

  // From the first edit until the editor goes, other saves (Copy, the nudge, Undo) wait: they
  // would move the version this draft will be saved against.
  const releaseOpenRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      releaseOpenRef.current?.();
      releaseOpenRef.current = null;
    },
    []
  );

  const begin = () => {
    if (held) return;
    releaseOpenRef.current ??= markEditorOpen();
    const first: EditScope = fixedDates
      ? { kind: "dates", dates: fixedDates }
      : ruleScope
        ? { kind: "rule", ...ruleScope, from: date }
        : { kind: "date", date };
    const seed = seedServices(config, day, first);
    setEdit({
      base: state,
      scope: first,
      services: seed,
      baseline: seed,
      parked: [],
      unsaved: [],
      overridden: [],
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
        overwrite,
        body: {
          expectedVersion: edit.base.version,
          changes,
          // A single date is an explicit choice; there is nothing to keep or replace.
          scopeConflicts: conflictMode,
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
      });
    } else {
      setFailure({ messages: [describeApiError(error).detail] });
    }
  };

  const discardMine = () => {
    setConflict(null);
    onDirtyChange(false);
    onStale?.();
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
              <Button
                variant="ghost"
                size="sm"
                {...waitingProps(held, heldReasonId)}
                onClick={begin}
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
            onClick={begin}
          >
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
        {t("availability.editor.scopeCount", { count: dates.length })}
      </Text>
      <ServicesEditor
        services={edit.services}
        venueServices={config.venueServices}
        date={overnightHintDate(edit.scope, date, dates)}
        onChange={(services) => {
          // Hours set again here are the Manager's own, so the line about the old ones goes, and
          // a held edit or removal for a service added back in this scope is dropped with its name.
          const present = new Set(services.map((s) => s.venueServiceId));
          const parked = edit.parked.filter((p) => !present.has(p.base.venueServiceId));
          const held = new Set(parked.flatMap((p) => (p.draft ? [p.draft.name] : [])));
          update({
            ...edit,
            services,
            parked,
            overridden: [],
            unsaved: edit.unsaved.filter((name) => held.has(name)),
          });
        }}
      />
    </>
  );
  // A scope that reaches no dates (a schedule used only by a use_schedule rule) has nothing to preview; the server refuses an empty scope.
  const preview =
    previewChanges && dates.length > 0 ? (
      <AvailabilityGuestPreview
        venueId={venueId}
        changes={previewChanges}
        scopeConflicts={conflictMode}
        dates={dates}
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
        <Alert variant="error" title={t("availability.editor.saveError")}>
          {failure.messages.map((message) => (
            <Text key={message} variant="body" color="primary">
              {message}
            </Text>
          ))}
        </Alert>
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
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          {t("availability.editor.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!isDirty(edit) || nameless || writtenCount === 0}
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
          failure={failure?.messages ?? []}
          onOverwrite={() => void submit(true)}
          onDiscard={discardMine}
        />
      )}
    </Stack>
  );
}
