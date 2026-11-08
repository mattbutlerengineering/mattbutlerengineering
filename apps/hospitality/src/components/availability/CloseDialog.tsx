import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Alert, Button, Dialog, Text, useToast } from "@mattbutlerengineering/rialto";
import {
  type AvailabilityChangeSummary,
  type AvailabilityConfigState,
  type ClosureImpact,
  type ClosureResult,
  type DateRule,
} from "@mbe/types";
import {
  useClosureImpact,
  useClosureImpacts,
  useCreateClosure,
  useCreateClosures,
} from "../../hooks/useClosures.js";
import { useVenueFloorPlanSections } from "../../hooks/useFloorPlans.js";
import { useNow } from "../../hooks/useNow.js";
import { useTables } from "../../hooks/useTables.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { serviceMinuteOf } from "../../utils/service-day.js";
import {
  buildCloseRules,
  closedDates,
  closureForm,
  decisionsReady,
  editAlongside,
  withoutChoicesFor,
  focusCloseField,
  inSeries,
  isUrgent,
  outcomeCounts,
  replacedSpecialDate,
  sameRequest,
  seriesForm,
  settleStartMinute,
  startMinutes,
  willHaveStepTwo,
  stepTwoNote,
  stepTwoNoteId,
  toDecisions,
  validateClose,
  type BookingChannel,
  type ChoiceMap,
  type CloseField,
  type CloseForm,
} from "./close-draft.js";
import { closeButtonText, closeToastText } from "./close-text.js";
import { combineImpacts, decisionsFor } from "./add-dates-draft.js";
import { AlreadyClosedNotice } from "./AlreadyClosedNotice.js";
import { LeaveSaveDialog } from "./LeaveSaveDialog.js";
import { useSaveAttempts } from "./use-save-attempts.js";
import { useWinningChangeText } from "./use-winning-change-text.js";
import { CloseStepOne } from "./CloseStepOne.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
import { GivenBackChoice } from "./GivenBackChoice.js";
import { outcomeLabel, outcomeSummary } from "./outcome-label.js";
import { sectionMembership } from "./section-membership.js";
import { sameRow } from "./series-edit.js";
import { refusalOf, refusalText } from "./step-two-refusal.js";
import styles from "./CloseDialog.module.css";

const endRequiredId = "close-end-required";

export interface CloseDialogProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  /** Pre-filled "one date"; `null` starts on tonight. */
  readonly initialDate: string | null;
  /** Start on "One section" with this section chosen; a section the venue does not have is ignored. */
  readonly initialSectionId?: string;
  /** Pre-filled "Several dates" (the selection bar's Close…); wins over `initialDate`. */
  readonly initialDates?: readonly string[];
  /** Start with "Booking only: online" and "Until I reopen" (pause online booking). */
  readonly pauseOnline?: boolean;
  /**
   * Makes the closure an edit of the one date `initialDate` of this series (ux.md F-SER "Edit
   * this date"): What and the window start as the series has them, and When is fixed to that date.
   */
  readonly series?: DateRule;
  /**
   * Makes the closure an edit of this saved one-date, range or open-ended closure (ux.md F6
   * "Edit"): the form starts as the closure has it, Step 2 decides only on the bookings the new
   * dates close, and the saved closure is replaced in the same save.
   */
  readonly editing?: DateRule;
  /**
   * Called instead of the toast when the save told no guest anything, with the saved change, so
   * the caller can offer Undo for it.
   */
  readonly onSavedQuietly?: (saved: ClosureResult) => void;
  /** A Host's emergency close (ux.md F7): Whole venue and Tonight, shown as text and not editable. */
  readonly hostLocked?: boolean;
  readonly onClose: () => void;
  /** The closure was saved; called just before `onClose`. */
  readonly onSaved?: () => void;
}

function initialForm(props: CloseDialogProps): CloseForm {
  const { initialDate, initialDates, initialSectionId, pauseOnline, hostLocked, series, editing } =
    props;
  const { today } = props;
  if (editing) return closureForm(editing);
  if (series && initialDate) return seriesForm(series, initialDate);
  if (hostLocked) {
    return {
      what: { kind: "venue" },
      when: { kind: "tonight" },
      fromMinute: null,
      staffNote: "",
      guestMessage: "",
    };
  }
  return {
    what: pauseOnline
      ? { kind: "booking", types: ["online"] }
      : initialSectionId
        ? { kind: "section", sectionId: initialSectionId }
        : { kind: "venue" },
    when: pauseOnline
      ? { kind: "until-reopen", from: today }
      : initialDates && initialDates.length > 1
        ? { kind: "dates", dates: [...initialDates].sort() }
        : initialDates?.length === 1
          ? { kind: "date", date: initialDates[0]! }
          : initialDate
            ? { kind: "date", date: initialDate }
            : { kind: "tonight" },
    fromMinute: null,
    staffNote: "",
    guestMessage: "",
  };
}

/** The button for a booking-only closure names the channels it pauses, not always "online". */
function pauseLabel(types: readonly BookingChannel[], t: TFunction): string {
  const only = types.length === 1 ? types[0] : undefined;
  if (only === "online") return t("availability.close.button.pause");
  if (only === "phone") return t("availability.close.button.pausePhone");
  if (only === "waitlist") return t("availability.close.button.pauseWaitlist");
  return t("availability.close.button.pauseBooking");
}

/**
 * Close, in two steps (ux.md F5): Step 1 says what, when and why with a live count of the
 * bookings it touches; Step 2, only when bookings are affected, makes the Manager decide
 * what happens to each group before anything is saved.
 */
export function CloseDialog(props: CloseDialogProps) {
  const { venueId, state, timezone, today, onClose } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const now = useNow();
  const createOne = useCreateClosure();
  const createMany = useCreateClosures();
  const isPending = createOne.isPending || createMany.isPending;
  const refresh = useRefreshAvailability();

  const sectionsRead = useVenueFloorPlanSections({ venueId });
  const tablesRead = useTables({ venueId, activeOnly: true, limit: 100 });
  const sections = useMemo(() => sectionsRead.data ?? [], [sectionsRead.data]);
  const membership = useMemo(() => sectionMembership(tablesRead.data ?? []), [tablesRead.data]);
  const sectionsStatus = sectionsRead.error
    ? "failed"
    : sectionsRead.data === undefined && sectionsRead.isLoading
      ? "loading"
      : "ready";

  const [form, setForm] = useState<CloseForm>(() => initialForm(props));
  // A section the dialog was opened for may not exist (a stale link): once the venue's sections
  // are known, no preselection is better than a choice that cannot be saved.
  const missingSection =
    props.initialSectionId !== undefined &&
    form.what.kind === "section" &&
    form.what.sectionId === props.initialSectionId &&
    sectionsStatus !== "loading" &&
    !sections.some((s) => s.id === props.initialSectionId);
  useEffect(() => {
    if (missingSection) setForm((prev) => ({ ...prev, what: { kind: "venue" } }));
  }, [missingSection]);
  const [step, setStep] = useState<1 | 2>(1);
  const [choices, setChoices] = useState<ChoiceMap>({});
  // Asked only when an edit gives back dates holding cancelled guests; like a Reopen, told by default.
  const [tellGivenBack, setTellGivenBack] = useState(true);
  const [invalid, setInvalid] = useState<CloseField | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Set on a 409 version conflict: the change that won, `null` when none is recorded.
  const [winner, setWinner] = useState<{
    readonly change: AvailabilityChangeSummary | null;
  } | null>(null);
  const winnerText = useWinningChangeText(winner?.change ?? null);
  const attempts = useSaveAttempts(state.config.dateRules, { reload: refresh, onLeave: onClose });
  const { ruleId, idempotencyKey, earlier } = attempts;
  const savedEarlier = earlier !== undefined;
  const leave = () => attempts.leave(isPending);
  const [startReset, setStartReset] = useState(false);
  const edit = (changed: CloseForm) => {
    const next = settleStartMinute(form, changed, state.config, timezone, today);
    setStartReset(next.fromMinute !== changed.fromMinute);
    if (!sameRequest(next, form)) {
      setChoices({});
      attempts.restart();
    } else {
      // A lost response then an edit to the message or a decision: see `useSaveAttempts`.
      attempts.edited(form, next);
    }
    setForm(next);
    setInvalid(null);
    attempts.setDirty(true);
  };

  const { series, editing } = props;
  const alongside = useMemo(() => (editing ? editAlongside(editing) : undefined), [editing]);
  // The saved closure is being replaced: it is not "already closed" ground, and a teammate who
  // changed or removed it since it was opened makes this edit void (the server refuses it too).
  const liveRules = editing
    ? state.config.dateRules.filter((r) => r.id !== editing.id)
    : state.config.dateRules;
  const liveRow = editing ? state.config.dateRules.find((r) => r.id === editing.id) : undefined;
  const editState = !editing
    ? null
    : !liveRow
      ? "gone"
      : sameRow(liveRow, editing)
        ? null
        : "changed";
  // Several dates are one closure each; these answer "which rule is for this date" so that a retry
  // keeps its ids (`attempt` ids) and a preview keeps its own (below).
  const [attemptIds] = useState(() => new Map<string, string>());
  const [previewIds] = useState(() => new Map<string, string>());
  const idIn = (ids: Map<string, string>, key: string) => {
    if (!ids.has(key)) ids.set(key, crypto.randomUUID());
    return ids.get(key)!;
  };
  const several = form.when.kind === "dates";
  // The preview has its own id, fixed for the dialog: a new attempt (new `ruleId`) must not be a
  // new impact query, or Step 2 would lose the bookings it is deciding on until it refetched.
  const [previewId] = useState(() => crypto.randomUUID());
  const impactRules = useMemo(
    () =>
      buildCloseRules(
        { ...form, staffNote: "", guestMessage: "" },
        (date) => (several ? idIn(previewIds, date) : previewId),
        today,
        membership
      ).map((r) => inSeries(r, series)!),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the id maps never change
    [form, previewId, today, series, several, membership]
  );
  const impactRule = several ? null : (impactRules[0] ?? null);
  const impactQuery = useClosureImpact({ venueId, rule: impactRule, alongside });
  const impactsQuery = useClosureImpacts({ venueId, rules: several ? impactRules : [] });
  const perDate = impactsQuery.data;
  const combined = useMemo(() => (perDate ? combineImpacts(perDate) : undefined), [perDate]);
  const impact: ClosureImpact | null | undefined = several
    ? impactRules.length > 0
      ? combined
      : null
    : impactRule
      ? impactQuery.data
      : null;
  const impactLoading = several ? impactsQuery.isLoading : impactQuery.isLoading;
  const impactError = several ? impactsQuery.error : impactQuery.error;
  const refetchImpact = () => void (several ? impactsQuery.refetch() : impactQuery.refetch());
  const groups = impact?.groups ?? [];
  const givenBack = editing ? impact?.givenBack : undefined;
  const rules = buildCloseRules(
    form,
    (date) => (several ? idIn(attemptIds, `${ruleId}:${date}`) : ruleId),
    today,
    membership
  ).map((r) => inSeries(r, series)!);
  const rule = rules[0] ?? null;
  const services = state.config.venueServices.filter((s) => !s.archivedAt);
  const { what } = form;
  const sectionName =
    what.kind === "section" ? sections.find((s) => s.id === what.sectionId)?.name : undefined;

  const startsOn = rule?.startsOn ?? today;
  // Special hours anywhere in the closure's dates (a range or a repeat too) are replaced by it.
  const replacedDate =
    form.what.kind !== "booking"
      ? (rules.map((r) => replacedSpecialDate(liveRules, r)).find((d) => d !== null) ?? null)
      : null;
  // Read every day the closure covers: a time must mean the same on all of them.
  const closedOn = rules.length > 0 ? rules.flatMap(closedDates) : [startsOn];
  const startOptions = startMinutes(
    state.config,
    timezone,
    closedOn,
    form.fromMinute,
    // Only a closure of today alone starts no earlier than now; any other date has its own hours.
    closedOn.length === 1 && closedOn[0] === today
      ? serviceMinuteOf(now, timezone, today)
      : undefined
  );

  const stepTwo = willHaveStepTwo(groups, givenBack);
  // Range and Repeats start with To empty: the closure is not one until the Manager picks it.
  const toMissing =
    (form.when.kind === "range" || form.when.kind === "repeats") && form.when.to === "";
  const targetName =
    what.kind === "service"
      ? services.find((s) => s.id === what.serviceId)?.name
      : what.kind === "section"
        ? sectionName
        : undefined;
  const fullDate = (date: string) =>
    format.formatCalendarDate(date, { weekday: "short", month: "short", day: "numeric" });

  const next = () => {
    const problem = validateClose(form, today);
    setInvalid(problem);
    if (problem) return focusCloseField(problem);
    if (stepTwo) setStep(2);
    else void save();
  };

  const saveOne = async (only: DateRule) => {
    const result = await createOne.mutateAsync({
      venueId,
      idempotencyKey,
      body: {
        expectedVersion: state.version,
        rule: only,
        ...(alongside ? { alongside } : {}),
        decisions: toDecisions(groups, choices),
        ...(givenBack ? { tellGivenBackGuests: tellGivenBack } : {}),
      },
    });
    return { outcomes: result.outcomes, result };
  };

  /** One command, one closure rule per date, each with the decisions of its own date's groups. */
  const saveMany = async () => {
    const decisions = decisionsFor(perDate ?? [], choices);
    const result = await createMany.mutateAsync({
      venueId,
      idempotencyKey,
      body: {
        expectedVersion: state.version,
        items: rules.map((r, i) => ({ rule: r, decisions: decisions[i] ?? [] })),
      },
    });
    const total = { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 };
    for (const r of result.results) {
      for (const key of Object.keys(total) as (keyof typeof total)[]) {
        total[key] += r.outcomes[key];
      }
    }
    return { outcomes: total, result: null };
  };

  const save = async () => {
    if (!rule) return;
    setFailure(null);
    setWinner(null);
    attempts.record(
      outcomeSummary(outcomeCounts(groups, choices), t),
      rules.map((r) => r.id),
      rules.map((r) => r.startsOn)
    );
    try {
      const saved = several ? await saveMany() : await saveOne(rule);
      const { cancel, move, keep_notify } = saved.outcomes;
      const notified = cancel + move + keep_notify;
      const givenBackTold = saved.result?.givenBackNotified ?? 0;
      // A repeat's From date may not be one of its days.
      const firstDate = closedDates(rule)[0] ?? startsOn;
      const date = fullDate(firstDate);
      const title = closeToastText(
        { form, date: firstDate, count: rules.length, name: targetName },
        { notified },
        t,
        format
      );
      if (props.onSavedQuietly && saved.result && notified === 0 && givenBackTold === 0) {
        // A save that told no guest is one History can revert: the caller offers Undo.
        props.onSavedQuietly(saved.result);
      } else {
        toast({
          title:
            notified === 0 && givenBackTold > 0
              ? t("availability.close.edit.toastTold", { date, count: givenBackTold })
              : title,
          variant: "success",
        });
      }
      props.onSaved?.();
      onClose();
    } catch (error) {
      const refused = refusalOf(error);
      setFailure(refusalText(refused, t, { groups, format }));
      if (refused.kind === "move-unavailable") {
        // Nothing was saved. The groups holding those bookings need another choice.
        setChoices(withoutChoicesFor(groups, choices, refused.reservationIds));
        // What Step 2 proposed no longer matches what the save does: ask again before Move is offered.
        refetchImpact();
      }
      if (refused.kind === "groups-changed") {
        // The group changed since the Manager chose: drop the stale choices and load the new one.
        setChoices({});
        refetchImpact();
        return;
      }
      attempts.failed(refused);
      if (refused.kind === "version-conflict") {
        setWinner({ change: refused.winningChange });
        refresh();
      } else if (refused.kind === "closure-exists") {
        refresh();
      }
    }
  };

  const counts = outcomeCounts(groups, choices);
  const urgent = isUrgent(
    { startsOn, endsOn: rule?.endsOn, repeat: rule?.repeat, fromMinute: form.fromMinute },
    today,
    serviceMinuteOf(now, timezone, today)
  );
  // Guests are only told right away when something tells them: a booking group or the given-back choice.
  const showStepTwoNote = step === 2 && (groups.length > 0 || (givenBack && tellGivenBack));
  // A disabled primary says why where it is: a disabled button cannot say it for itself.
  const showEndRequired = step === 1 && toMissing;
  const impactFailed = impactError !== null;
  // Step 2 decides on bookings it must be showing: with none loaded, `groups` is empty and the
  // choices would read as complete.
  const primaryDisabled =
    savedEarlier ||
    editState !== null ||
    (step === 2
      ? !impact || !decisionsReady(groups, choices)
      : impactLoading || impactFailed || toMissing);
  const label =
    step === 2
      ? groups.length === 0
        ? t("availability.close.edit.save")
        : outcomeLabel(counts, t)
      : stepTwo
        ? t("availability.close.next")
        : editing
          ? t("availability.close.edit.save")
          : form.what.kind === "booking"
            ? pauseLabel(form.what.types, t)
            : several
              ? t("availability.close.button.closeMany", {
                  count: form.when.kind === "dates" ? form.when.dates.length : 0,
                })
              : closeButtonText({ form, date: startsOn, name: targetName }, t, format);

  return (
    <>
      <Dialog
        open
        onClose={leave}
        title={
          editing
            ? t("availability.close.edit.title")
            : props.pauseOnline
              ? t("availability.close.button.pause")
              : t("availability.close.title")
        }
        description={
          savedEarlier || (step === 1 && !stepTwo)
            ? undefined
            : t("availability.close.step", { step })
        }
        footer={
          savedEarlier ? (
            <div className={styles.footer}>
              <Button variant="primary" onClick={attempts.finish}>
                {t("availability.close.savedEarlier.done")}
              </Button>
            </div>
          ) : (
            <div className={styles.footer}>
              {showStepTwoNote && (
                <Text
                  id={stepTwoNoteId}
                  variant="caption"
                  color="secondary"
                  className={styles.footerNote}
                >
                  {stepTwoNote(decisionsReady(groups, choices), t)}
                </Text>
              )}
              {showEndRequired && (
                <Text
                  id={endRequiredId}
                  variant="caption"
                  color="secondary"
                  className={styles.footerNote}
                >
                  {t("availability.close.when.endRequired")}
                </Text>
              )}
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={step === 2 ? () => setStep(1) : leave}
              >
                {step === 2 ? t("availability.close.back") : t("availability.close.cancel")}
              </Button>
              <Button
                variant="primary"
                data-testid="close-primary"
                aria-describedby={
                  showStepTwoNote ? stepTwoNoteId : showEndRequired ? endRequiredId : undefined
                }
                onClick={step === 2 ? () => void save() : next}
                isLoading={isPending}
                disabled={primaryDisabled}
              >
                {label}
              </Button>
            </div>
          )
        }
      >
        {earlier && (
          // The first attempt's choices are what applied: the form, which may show later edits,
          // and any failure of the attempts after it, are not the outcome. Never invite a retry.
          <Alert variant="info" title={t("availability.close.savedEarlier.title")}>
            {earlier.summary
              ? t("availability.close.savedEarlier.body", { summary: earlier.summary })
              : t("availability.close.savedEarlier.bodyPlain")}
          </Alert>
        )}
        {!savedEarlier && editState && (
          <Alert variant="warning">{t(`availability.close.edit.${editState}`)}</Alert>
        )}
        {!savedEarlier && failure && (
          <Alert variant="error" title={t("availability.close.saveError")}>
            {failure}
            {winner && <Text variant="body">{winnerText}</Text>}
          </Alert>
        )}
        {!savedEarlier && step === 1 && (
          <AlreadyClosedNotice
            rules={liveRules}
            draft={several ? rules : rule}
            services={services}
            today={today}
          />
        )}
        {/* A save in flight sends what was chosen: no control may change it meanwhile. */}
        <fieldset className={styles.lock} disabled={isPending} hidden={savedEarlier}>
          {step === 1 ? (
            <CloseStepOne
              form={form}
              onChange={edit}
              services={services}
              sections={sections}
              sectionsStatus={sectionsStatus}
              today={today}
              impact={impact}
              impactLoading={impactLoading}
              impactFailed={impactFailed}
              onRetryImpact={refetchImpact}
              replacedDate={replacedDate}
              invalid={invalid}
              locked={props.hostLocked}
              dateLocked={series !== undefined}
              closureEdit={editing !== undefined}
              startOptions={startOptions}
              startReset={startReset}
            />
          ) : (
            <>
              {impact && groups.length > 0 && (
                <CloseStepTwo
                  venueId={venueId}
                  impact={impact}
                  choices={choices}
                  urgent={urgent}
                  guestMessage={form.guestMessage}
                  onChoose={(key, choice) => {
                    attempts.edited(choices[key], choice);
                    setChoices({ ...choices, [key]: choice });
                    attempts.setDirty(true);
                  }}
                />
              )}
              {givenBack && (
                <GivenBackChoice
                  guests={givenBack.guests}
                  tell={tellGivenBack}
                  onChange={(tell) => {
                    attempts.edited(tellGivenBack, tell);
                    setTellGivenBack(tell);
                    attempts.setDirty(true);
                  }}
                />
              )}
              {!impact && impactFailed && (
                <Text variant="body" color="secondary">
                  {t("availability.close.step2.loadFailed")}
                </Text>
              )}
              {!impact && !impactFailed && (
                <Text variant="body" color="secondary">
                  {t("availability.close.step2.loading")}
                </Text>
              )}
            </>
          )}
        </fieldset>
      </Dialog>
      <LeaveSaveDialog attempts={attempts} />
    </>
  );
}
