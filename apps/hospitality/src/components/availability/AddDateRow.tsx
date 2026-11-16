import { useTranslation } from "react-i18next";
import {
  Button,
  DatePicker,
  Radio,
  RadioGroup,
  SegmentedControl,
  Tag,
  Text,
  TextArea,
} from "@mattbutlerengineering/rialto";
import { GUEST_MESSAGE_MAX_LENGTH } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useViewport } from "../../hooks/useViewport.js";
import { rowFieldId, type DateRow, type RowField, type RowKind } from "./add-dates-draft.js";
import { WEEK_STARTS_ON } from "./calendar-dates.js";
import styles from "./AddSpecialDatesSheet.module.css";

const KINDS: readonly RowKind[] = ["closed", "hours"];

export interface AddDateRowProps {
  readonly row: DateRow;
  readonly index: number;
  readonly today: string;
  /** The field of this row that blocks Next, if any. */
  readonly invalid: RowField | null;
  readonly canRemove: boolean;
  /** One shared message is in force, so this row has no message field. */
  readonly messageShared: boolean;
  readonly onChange: (row: DateRow) => void;
  readonly onRemove: () => void;
}

/**
 * One row of the Add special date sheet (ux.md F6): a date, Closed or Special hours, its message.
 * Special hours has no fields here: Next opens the day editor on the date (D5.1).
 */
export function AddDateRow(props: AddDateRowProps) {
  const { row, index, today, invalid, messageShared, onChange } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  // Segments stack as radios on a phone, as the Close dialog's What and When do.
  const onPhone = useViewport() === "phone";
  // Trimmed, like validateRows: what blocks Next is what the field flags.
  const messageError = row.message.trim().length > GUEST_MESSAGE_MAX_LENGTH;
  const closed = row.kind === "closed";

  const holidayMessage = row.name
    ? t("availability.close.suggestions.holidayNamed", { name: row.name })
    : "";

  const chooseDate = (date: string) => {
    // The row's name was the date it opened on; another date is not that holiday.
    const { name: _name, ...rest } = row;
    onChange({ ...(date === row.date ? row : rest), date });
  };

  return (
    <fieldset className={styles.row}>
      <legend className={styles.legend}>
        {row.name
          ? t("availabilitySpecial.add.rowLegendNamed", { n: index + 1, name: row.name })
          : t("availabilitySpecial.add.rowLegend", { n: index + 1 })}
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
      {onPhone ? (
        <RadioGroup
          label={t("availabilitySpecial.add.kindLabel", { n: index + 1 })}
          name={`add-date-kind-${row.key}`}
          value={row.kind}
          onChange={(id) => onChange({ ...row, kind: id as RowKind })}
        >
          {KINDS.map((id) => (
            <Radio key={id} value={id} label={t(`availabilitySpecial.add.kind.${id}`)} />
          ))}
        </RadioGroup>
      ) : (
        <SegmentedControl
          aria-label={t("availabilitySpecial.add.kindLabel", { n: index + 1 })}
          segments={KINDS.map((id) => ({ id, label: t(`availabilitySpecial.add.kind.${id}`) }))}
          value={row.kind}
          onChange={(id) => onChange({ ...row, kind: id as RowKind })}
        />
      )}
      {!closed && (
        <Text
          variant="caption"
          color={invalid === "hours" ? "error" : "secondary"}
          role={invalid === "hours" ? "alert" : undefined}
        >
          {t(
            invalid === "hours"
              ? "availabilitySpecial.add.hoursOneDate"
              : "availabilitySpecial.add.hoursHandoff"
          )}
        </Text>
      )}
      {closed && !messageShared && (
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
      {/* A row the sheet opened on a holiday offers the Close dialog's wording for it. */}
      {closed && !messageShared && row.name && (
        <div className={styles.chips}>
          <Tag
            selected={row.message === holidayMessage}
            onClick={() => onChange({ ...row, message: holidayMessage })}
          >
            {holidayMessage}
          </Tag>
        </div>
      )}
    </fieldset>
  );
}
