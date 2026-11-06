import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  Radio,
  RadioGroup,
  Text,
} from "@mattbutlerengineering/rialto";
import type { DateRule } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { ClosureLayerActions } from "./ClosureLayerActions.js";
import { closedAllDay } from "./closed-all-day.js";
import { skipInitialFocus, waitingProps } from "./draft-wait.js";
import { DATE_FORMAT, hoursSubject } from "./rule-subjects.js";
import type { SeriesScope } from "./series-edit.js";
import type { LayerRuleActionsProps } from "./layer-rule-actions-props.js";
import { coversManyDates, type SpecialDateRule } from "./special-dates.js";
import {
  datedAssignmentOf,
  DatedScheduleActions,
  UseScheduleRuleActions,
} from "./ScheduleLayerActions.js";
import { StrandedBookings } from "./StrandedBookings.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./CloseDialog.module.css";

type HoursChoice = "only" | SeriesScope;

/** Which of a range or repeat's dates an edit reaches, asked about the date the drawer is on. */
function HoursScopeChoice(props: {
  readonly date: string;
  readonly onChoose: (choice: HoursChoice) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const [choice, setChoice] = useState<HoursChoice>("only");
  const label = format.formatCalendarDate(props.date, DATE_FORMAT);
  return (
    <Dialog
      open
      onClose={props.onClose}
      title={t("availabilitySpecial.hours.scope.title")}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={props.onClose}>
            {t("availabilitySpecial.series.cancel")}
          </Button>
          <Button variant="primary" onClick={() => props.onChoose(choice)}>
            {t("availabilitySpecial.hours.scope.continue")}
          </Button>
        </div>
      }
    >
      <RadioGroup
        label={t("availabilitySpecial.series.scopeLabel")}
        name="layer-hours-scope"
        value={choice}
        onChange={(value) => setChoice(value as HoursChoice)}
      >
        <Radio value="only" label={t("availabilitySpecial.series.scopeOnly", { date: label })} />
        <Radio
          value="following"
          label={t("availabilitySpecial.hours.scope.following", { date: label })}
        />
        <Radio value="all" label={t("availabilitySpecial.hours.scope.all")} />
      </RadioGroup>
    </Dialog>
  );
}

/** Edit and Remove for the special hours behind a layer (ux.md F-SER). */
function HoursLayerActions(props: LayerRuleActionsProps & { readonly rule: SpecialDateRule }) {
  const { rule, date, day, venueId, state, waiting, reasonId, onFinished, onStale } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const offerUndo = useAvailabilityUndo();
  const rowSave = useScheduleSave(onStale, "availabilitySpecial.rowStranded");
  const [step, setStep] = useState<"scope" | "remove" | null>(null);
  const many = coversManyDates(rule);
  const subject = hoursSubject(rule, format, t);
  // Hours written under an all-day closure surface only if the closure goes, so editing them hides.
  const hidden = closedAllDay(day);
  const editWaiting = waiting || hidden;
  const closedId = useId();

  const remove = async () => {
    setStep(null);
    const saved = await rowSave.save(
      venueId,
      state,
      { upsert: {}, remove: { dateRules: [rule.id] } },
      "keep"
    );
    if (!saved) return;
    offerUndo({ venueId, saved, title: t("availabilitySpecial.hours.removedToast", { subject }) });
    onFinished();
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        {...skipInitialFocus}
        {...waitingProps(editWaiting, hidden ? closedId : reasonId)}
        aria-label={
          many
            ? t("availabilitySpecial.hours.editRule", { subject })
            : t("availabilitySpecial.hours.editFor", {
                date: format.formatCalendarDate(date, DATE_FORMAT),
              })
        }
        onClick={() => {
          if (editWaiting) return;
          if (many) setStep("scope");
          else props.onEditHours();
        }}
      >
        {t("availabilitySpecial.hours.edit")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        {...skipInitialFocus}
        {...waitingProps(waiting, reasonId)}
        aria-label={t("availabilitySpecial.hours.removeFor", { subject })}
        onClick={() => {
          if (!waiting) setStep("remove");
        }}
      >
        {t("availabilitySpecial.remove")}
      </Button>
      {hidden && (
        <Text id={closedId} variant="caption" color="secondary">
          {t("availability.drawer.useBlockedClosed")}
        </Text>
      )}
      {rowSave.failure.length > 0 && (
        <Alert variant="error">
          {rowSave.failure.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </Alert>
      )}
      {rowSave.failure.length > 0 && <StrandedBookings reservations={rowSave.stranded} />}
      {step === "scope" && (
        <HoursScopeChoice
          date={date}
          onClose={() => setStep(null)}
          onChoose={(choice) => {
            setStep(null);
            props.onEditHours(choice === "only" ? undefined : { ruleId: rule.id, mode: choice });
          }}
        />
      )}
      {step === "remove" && (
        <ConfirmDialog
          open
          variant="destructive"
          title={t("availabilitySpecial.hours.removeTitle", { subject })}
          description={t(
            many
              ? "availabilitySpecial.hours.removeDescriptionMany"
              : "availabilitySpecial.hours.removeDescription"
          )}
          confirmLabel={t("availabilitySpecial.remove")}
          cancelLabel={t("availabilitySpecial.hours.keep")}
          onConfirm={() => void remove()}
          onCancel={() => setStep(null)}
        />
      )}
    </>
  );
}

const isHours = (rule: DateRule | undefined): rule is SpecialDateRule =>
  rule?.kind === "special_hours";

/**
 * Remove and Edit beside a layer of "Why this day" that stands for a saved rule. The dialogs and
 * saves are the Special dates tab's own, so a rule changes the same way from either place.
 */
export function LayerRuleActions(props: LayerRuleActionsProps) {
  const assignment = datedAssignmentOf(props.state.config, props.layer);
  if (assignment) return <DatedScheduleActions {...props} assignment={assignment} />;
  const rule = props.state.config.dateRules.find((r) => r.id === props.layer.id);
  if (!rule) return null;
  if (isHours(rule) && props.layer.kind === "special_hours") {
    return <HoursLayerActions {...props} rule={rule} />;
  }
  if (rule.kind === "closure" && props.layer.kind === "closure") {
    return <ClosureLayerActions {...props} rule={rule} />;
  }
  if (rule.kind === "use_schedule" && props.layer.kind === "use_schedule") {
    return <UseScheduleRuleActions {...props} rule={rule} />;
  }
  return null;
}
