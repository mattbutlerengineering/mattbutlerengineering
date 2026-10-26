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
import type { AvailabilityConfigChanges, AvailabilityConfigState, DateRule } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { addDays } from "../../utils/service-day.js";
import {
  coversDate,
  editSeriesDates,
  nextOccurrence,
  skipDate,
  type SeriesScope,
} from "./series-edit.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./CloseDialog.module.css";

type Scope = "only" | SeriesScope;

/** 2026-01-04 is a Sunday; weekday index n is that date plus n days. */
const SUNDAY = "2026-01-04";
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

export interface SeriesEditDialogProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly series: DateRule;
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
  const { venueId, state, series, today, onStale, onEditDate, onClose } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const { save, isPending, failure } = useScheduleSave(onStale);
  const [scope, setScope] = useState<Scope>("only");
  const [date, setDate] = useState(() => nextOccurrence(series, today));
  const [weekdays, setWeekdays] = useState<readonly number[]>(series.repeat?.weekdays ?? []);
  const [endsOn, setEndsOn] = useState<string | null>(series.endsOn ?? null);
  const [invalid, setInvalid] = useState<"date" | "edit" | null>(null);

  const label = (d: string) =>
    format.formatCalendarDate(d, { weekday: "short", month: "short", day: "numeric" });

  const commit = async (changes: AvailabilityConfigChanges, title: string) => {
    if (await save(venueId, state, changes, "keep")) {
      toast({ title, variant: "success" });
      onClose();
    }
  };
  const makeId = () => crypto.randomUUID();

  const skip = () => {
    if (!coversDate(series, date)) return setInvalid("date");
    setInvalid(null);
    void commit(
      skipDate(series, date, makeId),
      t("availabilitySpecial.series.skippedToast", { date: label(date) })
    );
  };
  const editThis = () => {
    if (!coversDate(series, date)) return setInvalid("date");
    onEditDate(series, date);
  };
  const saveSeries = () => {
    const bad =
      weekdays.length === 0 ||
      (endsOn != null && endsOn < (scope === "following" ? date : series.startsOn));
    if (bad || (scope === "following" && !coversDate(series, date))) {
      return setInvalid(bad ? "edit" : "date");
    }
    setInvalid(null);
    void commit(
      editSeriesDates(
        state.config,
        series,
        scope as SeriesScope,
        date,
        { weekdays, endsOn },
        makeId
      ),
      t("availabilitySpecial.series.savedToast")
    );
  };

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
    <Dialog
      open
      onClose={onClose}
      title={t("availabilitySpecial.series.title")}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
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
            <Button variant="primary" isLoading={isPending} onClick={saveSeries}>
              {t("availabilitySpecial.series.save")}
            </Button>
          )}
        </div>
      }
    >
      {failure.length > 0 && (
        <Alert variant="error">
          {failure.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </Alert>
      )}
      {dateField(date, setDate, t("availabilitySpecial.series.dateLabel"))}
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
  );
}
