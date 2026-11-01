import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  Radio,
  RadioGroup,
  useToast,
} from "@mattbutlerengineering/rialto";
import type {
  AvailabilityConfigChanges,
  AvailabilityConfigState,
  ClosureImpact,
  DateRule,
} from "@mbe/types";
import { firstOccurrenceOnOrAfter } from "@mbe/availability";
import { usePreviewClosureImpact } from "../../hooks/useClosures.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { addDays } from "../../utils/service-day.js";
import {
  coversDate,
  dateOverride,
  editSeriesDates,
  growsSeries,
  growthClosure,
  nextOccurrence,
  restoreDate,
  sameRow,
  skipDate,
  type SeriesScope,
} from "./series-edit.js";
import { LeaveSaveDialog } from "./LeaveSaveDialog.js";
import { SeriesGrowthStepTwo } from "./SeriesGrowthStepTwo.js";
import { useSaveAttempts } from "./use-save-attempts.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./CloseDialog.module.css";

type Scope = "only" | SeriesScope;
type GrowthPlan = ReturnType<typeof growthClosure>;

/** 2026-01-04 is a Sunday; weekday index n is that date plus n days. */
const SUNDAY = "2026-01-04";
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

export interface SeriesEditDialogProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** The series as it was opened; `state.config` is what is true now. */
  readonly series: DateRule;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
  /** "Edit this date…": hands the date to the closure flow (impact, then Step 2). */
  readonly onEditDate: (series: DateRule, date: string) => void;
  readonly onClose: () => void;
}

/**
 * Edit dates… on a repeating closure (ux.md F-SER): asks first whether the change reaches only
 * one date, this and the following ones, or the whole series. Skipping and series edits are a
 * config save, which the server refuses (never silently cancels) if a booking would be
 * stranded; editing one date to something else goes through the closure flow.
 */
export function SeriesEditDialog(props: SeriesEditDialogProps) {
  const { venueId, state, timezone, today, onStale, onEditDate, onClose } = props;
  // The state can reload under the dialog (a conflict, a refetch), so the series is read from it
  // on every render: a plan built from the one captured on open would overwrite the winner's edit.
  const live = state.config.dateRules.find((r) => r.id === props.series.id);
  const series = live ?? props.series;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const { save, isPending, failure } = useScheduleSave(
    onStale,
    "availabilitySpecial.series.stranded"
  );
  const [scope, setScope] = useState<Scope>("only");
  const [date, setDate] = useState(() => nextOccurrence(series, today));
  const [weekdays, setWeekdays] = useState<readonly number[]>(series.repeat?.weekdays ?? []);
  const [endsOn, setEndsOn] = useState<string | null>(series.endsOn ?? null);
  const [invalid, setInvalid] = useState<"date" | "edit" | "taken" | "skipped" | null>(null);
  const previewImpact = usePreviewClosureImpact();
  const [previewFailure, setPreviewFailure] = useState<string | null>(null);
  const [growth, setGrowth] = useState<
    (GrowthPlan & { impact: ClosureImpact; expectedVersion: number }) | null
  >(null);
  const attempts = useSaveAttempts(state.config.dateRules, { reload: onStale, onLeave: onClose });
  const [seen, setSeen] = useState(series);
  const [changedUnderneath, setChangedUnderneath] = useState(false);
  // What the last config save sent for this row: its response can be lost after it committed.
  const [sentRow, setSentRow] = useState<DateRule | null>(null);
  if (JSON.stringify(seen) !== JSON.stringify(series)) {
    // The row changed. The fields follow, and any plan built from the old row is void. Unless it
    // is what this dialog sent, someone else changed it.
    setSeen(series);
    setWeekdays(series.repeat?.weekdays ?? []);
    setEndsOn(series.endsOn ?? null);
    setGrowth(null);
    setPreviewFailure(null);
    if (!sentRow || !sameRow(sentRow, series)) setChangedUnderneath(true);
  }

  const label = (d: string) =>
    format.formatCalendarDate(d, { weekday: "short", month: "short", day: "numeric" });

  const commit = async (changes: AvailabilityConfigChanges, title: string) => {
    setSentRow(changes.upsert.dateRules?.find((r) => r.id === series.id) ?? null);
    if (await save(venueId, state, changes, "keep")) {
      toast({ title, variant: "success" });
      onClose();
    }
  };
  const makeId = () => crypto.randomUUID();

  const override = dateOverride(state.config.dateRules, series.id, date);
  const refuseOverridden = (): boolean => {
    if (!override) return false;
    setInvalid(override.kind === "skip" ? "skipped" : "taken");
    return true;
  };
  const restore = async () => {
    // Only a skip is restored; a one-date edit on this date is the Manager's change to keep.
    if (override?.kind !== "skip") return;
    await commit(
      restoreDate(override),
      t("availabilitySpecial.series.restoredToast", { date: label(date) })
    );
  };

  const skip = () => {
    if (!coversDate(series, date)) return setInvalid("date");
    if (refuseOverridden()) return;
    setInvalid(null);
    void commit(
      skipDate(series, date, makeId),
      t("availabilitySpecial.series.skippedToast", { date: label(date) })
    );
  };
  const editThis = () => {
    if (!coversDate(series, date)) return setInvalid("date");
    if (refuseOverridden()) return;
    onEditDate(series, date);
  };
  const saveSeries = () => {
    // No weekday, an end before the start, or no chosen day between them: it would close nothing.
    const from = scope === "following" && date ? date : series.startsOn;
    const repeat = { weekdays };
    const bad = firstOccurrenceOnOrAfter({ startsOn: from, endsOn, repeat }, from) === null;
    if (bad || (scope === "following" && !coversDate(series, date))) {
      return setInvalid(bad ? "edit" : "date");
    }
    setInvalid(null);
    const edit = { weekdays, endsOn };
    const seriesScope = scope as SeriesScope;
    const saveAsConfig = () =>
      commit(
        editSeriesDates(state.config, series, seriesScope, date, edit, makeId),
        t("availabilitySpecial.series.savedToast")
      );
    if (!growsSeries(series, edit)) return void saveAsConfig();
    void review(growthClosure(state.config, series, seriesScope, date, edit, makeId), saveAsConfig);
  };

  /**
   * An edit that can close new dates asks the closure command's impact first (ux.md F-SER step
   * 4): bookings on those dates go to Step 2; with none, it is the plain config save.
   */
  const review = async (plan: GrowthPlan, saveAsConfig: () => Promise<void>) => {
    setPreviewFailure(null);
    try {
      const impact = await previewImpact.mutateAsync({ venueId, ...plan });
      if (impact.groups.length === 0) return await saveAsConfig();
      // A new plan is a new request: a retry must not replay the save of an earlier one.
      attempts.restart(plan.rule.id);
      // `state` is the one `plan` was built from: the config can reload during the preview.
      setGrowth({ ...plan, impact, expectedVersion: state.version });
    } catch (error) {
      setPreviewFailure(describeApiError(error).detail);
    }
  };

  const notice = (alert: React.ReactNode) => (
    <Dialog
      open
      onClose={attempts.finish}
      title={t("availabilitySpecial.series.title")}
      footer={
        <div className={styles.footer}>
          <Button variant="primary" onClick={attempts.finish}>
            {t("availability.close.savedEarlier.done")}
          </Button>
        </div>
      }
    >
      {alert}
    </Dialog>
  );

  const { earlier } = attempts;
  if (earlier) {
    // The first attempt's choices are what applied, even if the series is now gone because of it.
    return notice(
      <Alert variant="info" title={t("availability.close.savedEarlier.title")}>
        {earlier.summary
          ? t("availability.close.savedEarlier.body", { summary: earlier.summary })
          : t("availability.close.savedEarlier.bodyPlain")}
      </Alert>
    );
  }
  if (!live) {
    return notice(<Alert variant="warning">{t("availabilitySpecial.series.gone")}</Alert>);
  }

  if (growth) {
    return (
      <>
        <SeriesGrowthStepTwo
          venueId={venueId}
          timezone={timezone}
          today={today}
          {...growth}
          attempts={attempts}
          onBack={() => {
            // The choices go with Step 2; only a save that may have applied is still worth a warning.
            if (!attempts.maybeSaved) attempts.setDirty(false);
            setGrowth(null);
          }}
          onClose={onClose}
          onReload={async () => {
            const { rule, alongside } = growth;
            const impact = await previewImpact.mutateAsync({ venueId, rule, alongside });
            setGrowth((current) => (current ? { ...current, impact } : current));
          }}
          onStale={(message) => {
            onStale();
            setGrowth(null);
            setPreviewFailure(message);
          }}
        />
        <LeaveSaveDialog attempts={attempts} />
      </>
    );
  }

  const dateField = (value: string, onChange: (v: string) => void, text: string, min?: string) => (
    <DatePicker
      label={text}
      value={value || null}
      min={min}
      locale={format.locale}
      onChange={(v) => onChange(v ?? "")}
    />
  );

  return (
    <>
      <Dialog
        open
        onClose={() => attempts.leave()}
        title={t("availabilitySpecial.series.title")}
        footer={
          <div className={styles.footer}>
            <Button variant="secondary" onClick={() => attempts.leave()}>
              {t("availabilitySpecial.series.cancel")}
            </Button>
            {scope === "only" ? (
              <>
                <Button variant="secondary" onClick={editThis}>
                  {t("availabilitySpecial.series.editThis")}
                </Button>
                <Button variant="primary" isLoading={isPending} onClick={skip}>
                  {t("availabilitySpecial.series.skip")}
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                isLoading={isPending || previewImpact.isPending}
                onClick={saveSeries}
              >
                {t("availabilitySpecial.series.save")}
              </Button>
            )}
          </div>
        }
      >
        {changedUnderneath && (
          <Alert variant="warning">{t("availabilitySpecial.series.changed")}</Alert>
        )}
        {(failure.length > 0 || previewFailure) && (
          <Alert variant="error">
            {[...failure, ...(previewFailure ? [previewFailure] : [])].map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Alert>
        )}
        {dateField(
          date,
          (next) => {
            // Every alert above was about the previous date.
            setInvalid(null);
            setDate(next);
          },
          t("availabilitySpecial.series.dateLabel")
        )}
        {invalid === "skipped" && (
          <Alert variant="warning">
            <div>{t("availabilitySpecial.series.alreadySkipped")}</div>
            <Button
              variant="secondary"
              size="sm"
              isLoading={isPending}
              onClick={() => void restore()}
            >
              {t("availabilitySpecial.series.restore")}
            </Button>
          </Alert>
        )}
        {invalid === "taken" && (
          <Alert variant="warning">{t("availabilitySpecial.series.dateChanged")}</Alert>
        )}
        {invalid === "date" && (
          <Alert variant="warning">{t("availabilitySpecial.series.invalidDate")}</Alert>
        )}
        <RadioGroup
          label={t("availabilitySpecial.series.scopeLabel")}
          name="series-scope"
          value={scope}
          onChange={(value) => setScope(value as Scope)}
        >
          <Radio
            value="only"
            label={t("availabilitySpecial.series.scopeOnly", { date: label(date) })}
          />
          <Radio value="following" label={t("availabilitySpecial.series.scopeFollowing")} />
          <Radio value="all" label={t("availabilitySpecial.series.scopeAll")} />
        </RadioGroup>
        {scope !== "only" && (
          <>
            <fieldset className={styles.weekdays}>
              <legend className={styles.legend}>{t("availabilitySpecial.series.weekdays")}</legend>
              {WEEK.map((day) => (
                <Checkbox
                  key={day}
                  label={format.formatCalendarDate(addDays(SUNDAY, day), { weekday: "short" })}
                  checked={weekdays.includes(day)}
                  onCheckedChange={(on) =>
                    setWeekdays(on ? [...weekdays, day] : weekdays.filter((d) => d !== day))
                  }
                />
              ))}
            </fieldset>
            {dateField(
              endsOn ?? "",
              (v) => setEndsOn(v || null),
              t("availabilitySpecial.series.endsLabel"),
              today
            )}
            {invalid === "edit" && (
              <Alert variant="warning">{t("availabilitySpecial.series.invalid")}</Alert>
            )}
          </>
        )}
      </Dialog>
      <LeaveSaveDialog attempts={attempts} />
    </>
  );
}
