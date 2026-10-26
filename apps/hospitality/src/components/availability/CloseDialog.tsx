import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Alert, Button, Dialog, Text, useToast } from "@mattbutlerengineering/rialto";
import {
  AvailabilityConfigProblemSchema,
  type AvailabilityConfigState,
  type ClosureImpact,
} from "@mbe/types";
import { useClosureImpact, useCreateClosure } from "../../hooks/useClosures.js";
import { useNow } from "../../hooks/useNow.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { minutesOfDayIn } from "../../utils/service-day.js";
import {
  buildCloseRule,
  decisionsReady,
  isUrgent,
  outcomeCounts,
  toDecisions,
  validateClose,
  type ChoiceMap,
  type CloseField,
  type CloseForm,
  type OutcomeCounts,
} from "./close-draft.js";
import { CloseStepOne } from "./CloseStepOne.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
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
  readonly onClose: () => void;
}

function initialForm(props: CloseDialogProps): CloseForm {
  const { initialDate, pauseOnline, today } = props;
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

/** The button that names the result (ux.md F5 step 7): "Close and cancel 14". */
function outcomeLabel(counts: OutcomeCounts, t: TFunction): string {
  const parts = (["cancel", "move", "keep_notify", "keep_silent"] as const)
    .filter((a) => counts[a] > 0)
    .map((a) => ({ a, count: counts[a] }));
  if (parts.length === 1) {
    const [only] = parts;
    return t(`availability.close.button.${only!.a}`, { count: only!.count });
  }
  return t("availability.close.button.mixed", {
    parts: parts
      .map((p) => t(`availability.close.button.part.${p.a}`, { count: p.count }))
      .join(" · "),
  });
}

function failureText(error: unknown, t: TFunction): string {
  const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
  const problem = AvailabilityConfigProblemSchema.safeParse(details);
  if (problem.success && problem.data.code === "version-conflict") {
    return t("availability.close.versionConflict");
  }
  return describeApiError(error).detail;
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
  const { mutateAsync, isPending } = useCreateClosure();

  const [form, setForm] = useState<CloseForm>(() => initialForm(props));
  const [step, setStep] = useState<1 | 2>(1);
  const [choices, setChoices] = useState<ChoiceMap>({});
  const [invalid, setInvalid] = useState<CloseField | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // One id per dialog: the rule is created at most once, whatever the Manager retries.
  const [ruleId] = useState(() => crypto.randomUUID());

  const impactRule = useMemo(
    () => buildCloseRule({ ...form, staffNote: "", guestMessage: "" }, ruleId, today),
    [form, ruleId, today]
  );
  const impactQuery = useClosureImpact({ venueId, rule: impactRule });
  const impact: ClosureImpact | null | undefined = impactRule ? impactQuery.data : null;
  const groups = impact?.groups ?? [];
  const rule = buildCloseRule(form, ruleId, today);
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
    try {
      const result = await mutateAsync({
        venueId,
        idempotencyKey: crypto.randomUUID(),
        body: { expectedVersion: state.version, rule, decisions: toDecisions(groups, choices) },
      });
      const { cancel, move, keep_notify } = result.outcomes;
      const notified = cancel + move + keep_notify;
      const title =
        notified > 0
          ? t("availability.close.toast.notified", { date: fullDate(startsOn), count: notified })
          : t("availability.close.toast.closed", { date: fullDate(startsOn) });
      toast({ title, variant: "success" });
      onClose();
    } catch (error) {
      setFailure(failureText(error, t));
    }
  };

  const counts = outcomeCounts(groups, choices);
  const urgent = isUrgent(
    { startsOn, fromMinute: form.fromMinute },
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
    <Dialog
      open
      onClose={onClose}
      title={t("availability.close.title")}
      description={t("availability.close.step", { step })}
      footer={
        <div className={styles.footer}>
          {step === 2 && (
            <Text variant="caption" color="secondary" className={styles.footerNote}>
              {t("availability.close.step2.irreversible")}
            </Text>
          )}
          <Button variant="secondary" onClick={step === 2 ? () => setStep(1) : onClose}>
            {step === 2 ? t("availability.close.back") : t("availability.close.cancel")}
          </Button>
          <Button
            variant="primary"
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
        </Alert>
      )}
      {step === 1 ? (
        <CloseStepOne
          form={form}
          onChange={(f) => {
            setForm(f);
            setChoices({});
            setInvalid(null);
          }}
          services={services}
          today={today}
          impact={impact}
          impactLoading={impactQuery.isLoading}
          impactFailed={impactQuery.error !== null}
          replacedDate={replacedDate}
          invalid={invalid}
        />
      ) : (
        impact && (
          <CloseStepTwo
            impact={impact}
            choices={choices}
            urgent={urgent}
            guestMessage={form.guestMessage}
            onChoose={(key, choice) => setChoices({ ...choices, [key]: choice })}
          />
        )
      )}
    </Dialog>
  );
}
