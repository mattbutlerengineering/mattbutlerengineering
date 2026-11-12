import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, ConfirmDialog, Text } from "@mattbutlerengineering/rialto";
import type { TFunction } from "i18next";
import type { Layer } from "@mbe/availability";
import type { AvailabilityConfig, DateRule, ScheduleAssignment } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { closedAllDay } from "./closed-all-day.js";
import { skipInitialFocus, waitingProps } from "./draft-wait.js";
import { layerLabelText } from "./layer-text.js";
import type { LayerRuleActionsProps } from "./layer-rule-actions-props.js";
import { DATE_FORMAT } from "./rule-subjects.js";
import { coversManyDates } from "./special-dates.js";
import { ScopeDialog } from "./ScopeDialog.js";
import { StrandedBookings } from "./StrandedBookings.js";
import { UseScheduleDialog } from "./UseScheduleDialog.js";
import { useScheduleSave } from "./use-schedule-save.js";

/**
 * The assignment behind a layer of a schedule that runs over dates, not the regular week. A
 * superseded regular week (Change regular week with no end cuts it off the day before) is still
 * part of the regular week: it is not offered here, since removing it would leave its dates shut.
 */
export function datedAssignmentOf(
  config: Pick<AvailabilityConfig, "assignments" | "schedules">,
  layer: Layer
): ScheduleAssignment | undefined {
  if (layer.kind !== "schedule" || layer.regularWeek) return undefined;
  const assignment = config.assignments.find(
    (a) => a.id === layer.id && (a.startsOn != null || a.endsOn != null)
  );
  const schedule = config.schedules.find((x) => x.id === assignment?.scheduleId);
  return schedule && schedule.kind !== "regular" ? assignment : undefined;
}

/** "Jun 1 – Sep 15", "from Jun 1" or "until Sep 15": the period a dated schedule runs. */
function spanText(a: ScheduleAssignment, format: VenueFormat, t: TFunction): string {
  const day = (date: string) => format.formatCalendarDate(date, { month: "short", day: "numeric" });
  if (a.startsOn && a.endsOn) {
    return t("availability.drawer.schedule.spanRange", {
      from: day(a.startsOn),
      to: day(a.endsOn),
    });
  }
  if (a.startsOn) return t("availability.drawer.schedule.spanFrom", { from: day(a.startsOn) });
  return t("availability.drawer.schedule.spanUntil", { to: day(a.endsOn ?? "") });
}

type EditChoice = "only" | "all";

/** Which dates an edit of a dated schedule reaches: the drawer's date, or everywhere it runs. */
function EditScopeChoice(props: {
  readonly name: string;
  readonly date: string;
  /** Hours written for one date under an all-day closure would hide, so only "all" is offered. */
  readonly offerOnly: boolean;
  readonly onChoose: (choice: EditChoice) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  return (
    <ScopeDialog
      title={t("availability.drawer.schedule.scope.title", { name: props.name })}
      name="layer-schedule-scope"
      dateLabel={format.formatCalendarDate(props.date, DATE_FORMAT)}
      offer={props.offerOnly ? ["only", "all"] : ["all"]}
      onClose={props.onClose}
      onContinue={(scope) => props.onChoose(scope === "only" ? "only" : "all")}
    />
  );
}

interface Target {
  /** What the confirm and the toast call the thing removed. */
  readonly subject: string;
  /** The saved removal. */
  readonly remove: { readonly assignments: string[] } | { readonly dateRules: string[] };
  readonly description: string;
  readonly keepLabel: string;
}

interface ScheduleActionsProps extends LayerRuleActionsProps {
  readonly target: Target;
  /** What Edit does; `null` when the row has no Edit (a rule over many dates). */
  readonly edit: { readonly label: string; readonly run: () => void } | null;
  /** The scope question Edit asks first, when there is one. */
  readonly editScope?: { readonly name: string; readonly onChoose: (c: EditChoice) => void };
  /** Edit is shut for this reason (the element with this id says it), though Remove is not. */
  readonly editBlockedId?: string;
  readonly children?: ReactNode;
}

/** Edit and Remove, with the shared waiting rules, confirm and save path. */
function ScheduleActions(props: ScheduleActionsProps) {
  const { target, edit, editScope, date, day, venueId, state, waiting, reasonId } = props;
  const { t } = useTranslation();
  const offerUndo = useAvailabilityUndo();
  const rowSave = useScheduleSave(props.onStale, "availabilitySpecial.rowStranded");
  const [step, setStep] = useState<"scope" | "remove" | null>(null);
  const editBlocked = props.editBlockedId !== undefined;
  const editWaiting = waiting || editBlocked;

  const remove = async () => {
    setStep(null);
    const saved = await rowSave.save(venueId, state, { upsert: {}, remove: target.remove }, "keep");
    if (!saved) return;
    offerUndo({
      venueId,
      saved,
      title: t("availability.drawer.schedule.removedToast", { subject: target.subject }),
    });
    props.onFinished();
  };

  return (
    <>
      {edit && (
        <Button
          variant="ghost"
          size="sm"
          {...skipInitialFocus}
          {...waitingProps(editWaiting, editBlocked ? props.editBlockedId : reasonId)}
          aria-label={edit.label}
          onClick={() => {
            if (editWaiting) return;
            if (editScope) setStep("scope");
            else edit.run();
          }}
        >
          {t("availabilitySpecial.hours.edit")}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        {...skipInitialFocus}
        {...waitingProps(waiting, reasonId)}
        aria-label={t("availability.drawer.schedule.removeFor", { subject: target.subject })}
        onClick={() => {
          if (!waiting) setStep("remove");
        }}
      >
        {t("availabilitySpecial.remove")}
      </Button>
      {rowSave.failure.length > 0 && (
        <Alert variant="error">
          {rowSave.failure.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </Alert>
      )}
      {rowSave.failure.length > 0 && <StrandedBookings reservations={rowSave.stranded} />}
      {step === "scope" && editScope && (
        <EditScopeChoice
          name={editScope.name}
          date={date}
          offerOnly={!closedAllDay(day)}
          onClose={() => setStep(null)}
          onChoose={(choice) => {
            setStep(null);
            editScope.onChoose(choice);
          }}
        />
      )}
      {step === "remove" && (
        <ConfirmDialog
          open
          variant="destructive"
          title={t("availability.drawer.schedule.removeTitle", { subject: target.subject })}
          description={target.description}
          confirmLabel={t("availabilitySpecial.remove")}
          cancelLabel={target.keepLabel}
          onConfirm={() => void remove()}
          onCancel={() => setStep(null)}
        />
      )}
      {props.children}
    </>
  );
}

/** Edit and Remove for the dated schedule behind a layer ("Summer hours · Jun 1 – Sep 15"). */
export function DatedScheduleActions(
  props: LayerRuleActionsProps & { readonly assignment: ScheduleAssignment }
) {
  const { assignment, layer, onEditSchedule: editSchedule } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const name = layerLabelText(layer, t, format);
  const subject = t("availability.drawer.schedule.subjectDated", {
    name,
    span: spanText(assignment, format, t),
  });
  return (
    <ScheduleActions
      {...props}
      target={{
        subject,
        remove: { assignments: [assignment.id] },
        description: t("availability.drawer.schedule.removeDescriptionDated", { name }),
        keepLabel: t("availability.drawer.schedule.keepSchedule"),
      }}
      edit={
        editSchedule
          ? {
              label: t("availability.drawer.schedule.editNamed", { name }),
              run: () => editSchedule(assignment.scheduleId),
            }
          : null
      }
      editScope={
        editSchedule
          ? {
              name,
              onChoose: (choice) => {
                if (choice === "all") editSchedule(assignment.scheduleId);
                else props.onEditHours();
              },
            }
          : undefined
      }
    />
  );
}

/** Edit and Remove for a "Use <schedule>" rule on this date: one rule per date, or a wider one. */
export function UseScheduleRuleActions(props: LayerRuleActionsProps & { readonly rule: DateRule }) {
  const { rule, layer, date, venueId, state, timezone } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const [changing, setChanging] = useState(false);
  // The dialog writes hours rules, which surface only if an all-day closure goes.
  const hidden = closedAllDay(props.day);
  const closedId = useId();
  const dialogDates = useMemo(() => [date], [date]);
  const many = coversManyDates(rule);
  const label = layerLabelText(layer, t, format);
  const subject = t("availability.drawer.schedule.subjectRule", {
    label,
    date: format.formatCalendarDate(date, DATE_FORMAT),
  });
  return (
    <ScheduleActions
      {...props}
      editBlockedId={hidden ? closedId : undefined}
      target={{
        subject: many ? label : subject,
        remove: { dateRules: [rule.id] },
        description: t(
          many
            ? "availability.drawer.schedule.removeDescriptionRuleMany"
            : "availability.drawer.schedule.removeDescriptionRule"
        ),
        keepLabel: t("availability.drawer.schedule.keep"),
      }}
      // One rule covering several dates cannot be changed from one of them: the dialog writes one
      // rule per date, so it would leave this one in force beside its own.
      edit={
        many
          ? null
          : {
              label: t("availability.drawer.schedule.changeFor", {
                date: format.formatCalendarDate(date, DATE_FORMAT),
              }),
              run: () => setChanging(true),
            }
      }
    >
      {hidden && (
        <Text id={closedId} variant="caption" color="secondary">
          {t("availability.drawer.useBlockedClosed")}
        </Text>
      )}
      {changing && (
        <UseScheduleDialog
          open
          venueId={venueId}
          state={state}
          timezone={timezone}
          dates={dialogDates}
          onClose={() => setChanging(false)}
          onFinished={() => {
            setChanging(false);
            props.onFinished();
          }}
          onStale={props.onStale}
        />
      )}
    </ScheduleActions>
  );
}
