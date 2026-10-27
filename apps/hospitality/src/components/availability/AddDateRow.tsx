import { useTranslation } from "react-i18next";
import {
  Button,
  DatePicker,
  SegmentedControl,
  Select,
  Text,
  TextArea,
} from "@mattbutlerengineering/rialto";
import { addDays, weekdayIndexOf } from "@mbe/availability";
import { GUEST_MESSAGE_MAX_LENGTH, type AvailabilityConfig } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import {
  regularServices,
  rowFieldId,
  type DateRow,
  type RowField,
  type RowKind,
} from "./add-dates-draft.js";
import { WEEK_STARTS_ON } from "./calendar-dates.js";
import { minuteText } from "./closure-band.js";
import { ServicesEditor } from "./ServicesEditor.js";
import styles from "./AddSpecialDatesSheet.module.css";

/** 2026-01-04 is a Sunday; weekday index n is that date plus n days. */
const SUNDAY = "2026-01-04";
const KINDS: readonly RowKind[] = ["closed", "hours", "same"];

export interface AddDateRowProps {
  readonly row: DateRow;
  readonly index: number;
  readonly config: AvailabilityConfig;
  readonly timezone: string;
  readonly today: string;
  /** The field of this row that blocks Next, if any. */
  readonly invalid: RowField | null;
  readonly canRemove: boolean;
  /** One shared message is in force, so this row has no message field. */
  readonly messageShared: boolean;
  readonly onChange: (row: DateRow) => void;
  readonly onRemove: () => void;
}

/** One row of the Add special date sheet (ux.md F6): a date, what happens to it, its message. */
export function AddDateRow(props: AddDateRowProps) {
  const { row, index, config, timezone, today, invalid, messageShared, onChange } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  // Trimmed, like validateRows: what blocks Next is what the field flags.
  const messageError = row.message.trim().length > GUEST_MESSAGE_MAX_LENGTH;
  const seed = (weekday: number) => regularServices(config, timezone, weekday, today);
  const weekdayName = (d: number) =>
    format.formatCalendarDate(addDays(SUNDAY, d), { weekday: "long" });

  // Special hours start from the regular hours of the row's own weekday.
  const ownWeekday = (date: string, fallback: number) => (date ? weekdayIndexOf(date) : fallback);

  const chooseKind = (kind: RowKind) => {
    const services =
      kind === "same"
        ? seed(row.sameAs)
        : kind === "hours" && row.services.length === 0
          ? seed(ownWeekday(row.date, row.sameAs))
          : row.services;
    onChange({ ...row, kind, services });
  };

  const chooseDate = (date: string) => {
    const weekday = ownWeekday(date, row.sameAs);
    onChange({
      ...row,
      date,
      // "Same as" starts on the date's own weekday; hours rows that are still empty get its hours.
      sameAs: row.kind === "closed" ? weekday : row.sameAs,
      services: row.kind === "hours" && row.services.length === 0 ? seed(weekday) : row.services,
    });
  };

  return (
    <fieldset className={styles.row}>
      <legend className={styles.legend}>
        {t("availabilitySpecial.add.rowLegend", { n: index + 1 })}
      </legend>
      <div className={styles.rowHead}>
        <DatePicker
          id={rowFieldId(row.key, "date")}
          label={t("availabilitySpecial.add.date")}
          value={row.date || null}
          min={today}
          locale={format.locale}
          weekStartsOn={WEEK_STARTS_ON}
          onChange={(date) => chooseDate(date ?? "")}
        />
        {props.canRemove && (
          <Button
            variant="ghost"
            aria-label={t("availabilitySpecial.add.removeRow", { n: index + 1 })}
            onClick={props.onRemove}
          >
            {t("availabilitySpecial.remove")}
          </Button>
        )}
      </div>
      {(invalid === "dateMissing" || invalid === "date") && (
        <Text variant="caption" color="error" role="alert">
          {t(
            invalid === "dateMissing"
              ? "availabilitySpecial.add.dateMissing"
              : "availabilitySpecial.add.dateInvalid"
          )}
        </Text>
      )}
      <SegmentedControl
        aria-label={t("availabilitySpecial.add.kindLabel", { n: index + 1 })}
        segments={KINDS.map((id) => ({ id, label: t(`availabilitySpecial.add.kind.${id}`) }))}
        value={row.kind}
        onChange={(id) => chooseKind(id as RowKind)}
      />
      {row.kind === "same" && (
        <>
          <Select
            id={rowFieldId(row.key, "same")}
            label={t("availabilitySpecial.add.sameAs")}
            value={String(row.sameAs)}
            options={[0, 1, 2, 3, 4, 5, 6].map((d) => ({
              value: String(d),
              label: t("availabilitySpecial.add.sameAsDay", { day: weekdayName(d) }),
            }))}
            onChange={(v) => onChange({ ...row, sameAs: Number(v), services: seed(Number(v)) })}
          />
          <ul className={styles.summary}>
            {row.services.map((s) => (
              <li key={s.key}>
                <Text variant="caption" color="secondary">
                  {t("availability.editor.serviceLine", {
                    name: s.name,
                    from: minuteText(s.opensAt, t, format),
                    to: minuteText(s.closesAt, t, format),
                  })}
                </Text>
              </li>
            ))}
          </ul>
          {row.services.length === 0 && (
            <Text variant="caption" color="error" role="alert">
              {t("availabilitySpecial.add.sameEmpty", { day: weekdayName(row.sameAs) })}
            </Text>
          )}
        </>
      )}
      {row.kind === "hours" && (
        <>
          <div id={rowFieldId(row.key, "hours")}>
            <ServicesEditor
              services={row.services}
              venueServices={config.venueServices}
              date={row.date || today}
              allowNew={false}
              onChange={(services) => onChange({ ...row, services })}
            />
          </div>
          {invalid === "hours" && (
            <Text variant="caption" color="error" role="alert">
              {t("availabilitySpecial.add.hoursInvalid")}
            </Text>
          )}
        </>
      )}
      {!messageShared && (
        <TextArea
          id={rowFieldId(row.key, "message")}
          label={t("availability.close.guestMessage")}
          value={row.message}
          maxLength={GUEST_MESSAGE_MAX_LENGTH}
          error={messageError}
          hint={
            messageError
              ? t("availability.close.guestMessageTooLong", { max: GUEST_MESSAGE_MAX_LENGTH })
              : undefined
          }
          showOptional
          onChange={(e) => onChange({ ...row, message: e.target.value })}
        />
      )}
    </fieldset>
  );
}
