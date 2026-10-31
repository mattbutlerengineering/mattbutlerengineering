import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Alert, Button, Dialog, Text, useToast } from "@mattbutlerengineering/rialto";
import {
  type AvailabilityChangeSummary,
  type AvailabilityConfigState,
  type ClosureImpact,
  type DateRule,
} from "@mbe/types";
import { useClosureImpact, useCreateClosure } from "../../hooks/useClosures.js";
import { useNow } from "../../hooks/useNow.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { minutesOfDayIn } from "../../utils/service-day.js";
import {
  buildCloseRule,
  decisionsReady,
  isUrgent,
  outcomeCounts,
  sameRequest,
  toDecisions,
  validateClose,
  type ChoiceMap,
  type CloseField,
  type CloseForm,
} from "./close-draft.js";
import { conflictOf, isDecisionRequired } from "./conflict-problem.js";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";
import { useDiscardGuard } from "./use-discard-guard.js";
import { useWinningChangeText } from "./use-winning-change-text.js";
import { CloseStepOne } from "./CloseStepOne.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
import { outcomeLabel } from "./outcome-label.js";
import styles from "./CloseDialog.module.css";

export interface CloseDialogProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  /** Pre-filled "one date"; `null` starts on tonight. */
  readonly initialDate: string | null;
  /** Start with "Booking only: online" and "Until I reopen" (pause online booking). */
  readonly pauseOnline?: boolean;
  /**
   * Makes the closure an edit of the one date `initialDate` of this series (ux.md F-SER "Edit
   * this date"): What and the window start as the series has them, and When is fixed to that date.
   */
  readonly series?: DateRule;
  /** A Host's emergency close (ux.md F7): Whole venue and Tonight, shown as text and not editable. */
  readonly hostLocked?: boolean;
  readonly onClose: () => void;
}

function initialForm(props: CloseDialogProps): CloseForm {
  const { initialDate, pauseOnline, hostLocked, series, today } = props;
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
    what: pauseOnline ? { kind: "booking", types: ["online"] } : { kind: "venue" },
    when: pauseOnline
      ? { kind: "until-reopen", from: today }
      : initialDate
        ? { kind: "date", date: initialDate }
        : { kind: "tonight" },
    fromMinute: null,
    staffNote: "",
    guestMessage: "",
  };
}

function whatOf(series: DateRule): CloseForm["what"] {
  if (series.targetKind === "service" && series.venueServiceId) {
    return { kind: "service", serviceId: series.venueServiceId };
  }
  if (series.targetKind === "booking" && series.bookingTypes?.length) {
    return { kind: "booking", types: [...series.bookingTypes] };
  }
  return { kind: "venue" };
}

/** The form for editing one date of `series`: the series' target and start time, on that date. */
function seriesForm(series: DateRule, date: string): CloseForm {
  return {
    what: whatOf(series),
    when: { kind: "date", date },
    fromMinute: series.window?.from ?? null,
    staffNote: "",
    guestMessage: "",
  };
}

/**
 * An edit of one date of a series. The engine applies a rule with a `seriesId` on its start date
 * only, so the rule is pinned to that single date whatever the form says.
 */
function inSeries(rule: DateRule | null, series: DateRule | undefined): DateRule | null {
  if (!rule || !series) return rule;
  return { ...rule, seriesId: series.id, endsOn: rule.startsOn, repeat: null };
}

function failureText(error: unknown, t: TFunction): string {
  const code = conflictOf(error)?.code;
  if (code === "version-conflict") return t("availability.close.versionConflict");
  if (code === "closure-exists") return t("availability.close.alreadySaved");
  return describeApiError(error).detail;
}

/** One rule id and one idempotency key per request: a retry of it replays the first result. */
const newAttempt = () => ({ ruleId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() });

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
  const { mutateAsync, isPending } = useCreateClosure();
  const refresh = useRefreshAvailability();

  const [form, setForm] = useState<CloseForm>(() => initialForm(props));
  const [step, setStep] = useState<1 | 2>(1);
  const [choices, setChoices] = useState<ChoiceMap>({});
  const [invalid, setInvalid] = useState<CloseField | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Set on a 409 version conflict: the change that won, `null` when none is recorded.
  const [winner, setWinner] = useState<{
    readonly change: AvailabilityChangeSummary | null;
  } | null>(null);
  const winnerText = useWinningChangeText(winner?.change ?? null);
  // The rule is created at most once per request, whatever the Manager retries; a lost response
  // then a retry replays the first result. Changing the request starts a new attempt.
  const [attempt, setAttempt] = useState(newAttempt);
  const { ruleId, idempotencyKey } = attempt;
  const guard = useDiscardGuard<null>(() => onClose());
  const leave = () => {
    // Escape during a save would close the dialog while the save still commits.
    if (!isPending) guard.request(null);
  };
  // A failed save may still have committed (a lost response). The server replays a retry of its
  // key as the original success, hiding any later edit, so after a failure an edit to the
  // message or a decision is a new attempt: a stale expected version then answers honestly.
  const [failedSave, setFailedSave] = useState(false);
  const restart = () => {
    setAttempt(newAttempt());
    setFailedSave(false);
  };
  const edit = (next: CloseForm) => {
    if (!sameRequest(next, form)) {
      setChoices({});
      restart();
    } else if (failedSave && JSON.stringify(next) !== JSON.stringify(form)) {
      restart();
    }
    setForm(next);
    setInvalid(null);
    guard.setDirty(true);
  };

  const { series } = props;
  const impactRule = useMemo(
    () =>
      inSeries(buildCloseRule({ ...form, staffNote: "", guestMessage: "" }, ruleId, today), series),
    [form, ruleId, today, series]
  );
  const impactQuery = useClosureImpact({ venueId, rule: impactRule });
  const impact: ClosureImpact | null | undefined = impactRule ? impactQuery.data : null;
  const groups = impact?.groups ?? [];
  const rule = inSeries(buildCloseRule(form, ruleId, today), series);
  const services = state.config.venueServices.filter((s) => !s.archivedAt);

  const startsOn = rule?.startsOn ?? today;
  const hasSpecialHours = state.config.dateRules.some(
    (r) =>
      r.kind === "special_hours" && r.startsOn <= startsOn && (r.endsOn ?? startsOn) >= startsOn
  );
  const replacedDate = hasSpecialHours && form.what.kind !== "booking" ? startsOn : null;

  const fullDate = (date: string) =>
    format.formatCalendarDate(date, { weekday: "short", month: "short", day: "numeric" });

  const next = () => {
    const problem = validateClose(form, today);
    setInvalid(problem);
    if (problem) return;
    if (groups.length > 0) setStep(2);
    else void save();
  };

  const save = async () => {
    if (!rule) return;
    setFailure(null);
    setWinner(null);
    try {
      const result = await mutateAsync({
        venueId,
        idempotencyKey,
        body: { expectedVersion: state.version, rule, decisions: toDecisions(groups, choices) },
      });
      const { cancel, move, keep_notify } = result.outcomes;
      const notified = cancel + move + keep_notify;
      const title =
        notified > 0
          ? t("availability.close.toast.notified", { date: fullDate(startsOn), count: notified })
          : form.what.kind === "booking"
            ? form.what.types.length === 1 && form.what.types[0] === "online"
              ? t("availability.close.toast.paused")
              : t("availability.close.toast.bookingPaused", { date: fullDate(startsOn) })
            : t("availability.close.toast.closed", { date: fullDate(startsOn) });
      toast({ title, variant: "success" });
      onClose();
    } catch (error) {
      if (isDecisionRequired(error)) {
        // The group changed since the Manager chose: drop the stale choices and load the new one.
        setChoices({});
        setFailure(t("availability.close.groupsChanged"));
        void impactQuery.refetch();
        return;
      }
      setFailure(failureText(error, t));
      setFailedSave(true);
      const conflict = conflictOf(error);
      if (conflict?.code === "version-conflict") {
        setWinner({ change: conflict.winningChange });
        refresh();
      } else if (conflict?.code === "closure-exists") {
        refresh();
      }
    }
  };

  const counts = outcomeCounts(groups, choices);
  const urgent = isUrgent(
    { startsOn, endsOn: rule?.endsOn, repeat: rule?.repeat, fromMinute: form.fromMinute },
    today,
    minutesOfDayIn(now, timezone)
  );
  const primaryDisabled =
    step === 2
      ? !decisionsReady(groups, choices)
      : impactQuery.isLoading || (impactRule !== null && impactQuery.error !== null);
  const label =
    step === 2
      ? outcomeLabel(counts, t)
      : groups.length > 0
        ? t("availability.close.next")
        : form.what.kind === "booking"
          ? t("availability.close.button.pause")
          : t("availability.close.button.close", {
              date:
                form.when.kind === "date" || form.when.kind === "tonight" ? fullDate(startsOn) : "",
            }).trim();

  return (
    <>
      <Dialog
        open
        onClose={leave}
        title={t("availability.close.title")}
        description={t("availability.close.step", { step })}
        footer={
          <div className={styles.footer}>
            {step === 2 && (
              <Text variant="caption" color="secondary" className={styles.footerNote}>
                {t("availability.close.step2.irreversible")}
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
              onClick={step === 2 ? () => void save() : next}
              isLoading={isPending}
              disabled={primaryDisabled}
            >
              {label}
            </Button>
          </div>
        }
      >
        {failure && (
          <Alert variant="error" title={t("availability.close.saveError")}>
            {failure}
            {winner && <Text variant="body">{winnerText}</Text>}
          </Alert>
        )}
        {/* A save in flight sends what was chosen: no control may change it meanwhile. */}
        <fieldset className={styles.lock} disabled={isPending}>
          {step === 1 ? (
            <CloseStepOne
              form={form}
              onChange={edit}
              services={services}
              today={today}
              impact={impact}
              impactLoading={impactQuery.isLoading}
              impactFailed={impactQuery.error !== null}
              replacedDate={replacedDate}
              invalid={invalid}
              locked={props.hostLocked}
              dateLocked={series !== undefined}
            />
          ) : (
            impact && (
              <CloseStepTwo
                impact={impact}
                choices={choices}
                urgent={urgent}
                guestMessage={form.guestMessage}
                onChoose={(key, choice) => {
                  if (failedSave && JSON.stringify(choices[key]) !== JSON.stringify(choice))
                    restart();
                  setChoices({ ...choices, [key]: choice });
                  guard.setDirty(true);
                }}
              />
            )
          )}
        </fieldset>
      </Dialog>
      <DiscardChangesDialog
        open={guard.pending !== null}
        date={null}
        wording={{
          title: t("availability.close.discard.title"),
          description: t("availability.close.discard.description"),
        }}
        onDiscard={guard.confirmDiscard}
        onKeepEditing={guard.keepEditing}
      />
    </>
  );
}
