import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  DatePicker,
  Dialog,
  Radio,
  RadioGroup,
} from "@mattbutlerengineering/rialto";
import type { DateRule } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { coversDate } from "./scope-dates.js";
import type { SeriesScope } from "./series-edit.js";
import styles from "./CloseDialog.module.css";

/** Which dates of a range or repeating special-hours rule an edit reaches (ux.md F-SER step 2). */
export type HoursScope = "only" | SeriesScope;

export interface SpecialHoursScopeDialogProps {
  readonly rule: DateRule;
  /** Today on the venue clock: no earlier date can be picked. */
  readonly today: string;
  /** The date the question opens on: the rule's next date. */
  readonly initialDate: string;
  readonly onChoose: (scope: HoursScope, date: string) => void;
  readonly onClose: () => void;
}

/** Edit on a range or repeating special-hours row asks first, as the closure series dialog does. */
export function SpecialHoursScopeDialog(props: SpecialHoursScopeDialogProps) {
  const { rule, today, initialDate, onChoose, onClose } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const [scope, setScope] = useState<HoursScope>("only");
  const [date, setDate] = useState(initialDate);
  const [invalid, setInvalid] = useState(false);
  const dateLabel = format.formatCalendarDate(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const proceed = () => {
    // "All dates" needs no date; the others start from one the rule covers.
    if (scope !== "all" && (date < today || !coversDate(rule, date))) return setInvalid(true);
    onChoose(scope, date);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("availabilitySpecial.hours.scope.title")}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            {t("availabilitySpecial.series.cancel")}
          </Button>
          <Button variant="primary" onClick={proceed}>
            {t("availabilitySpecial.hours.scope.continue")}
          </Button>
        </div>
      }
    >
      {scope !== "all" && (
        <DatePicker
          label={t("availabilitySpecial.series.dateLabel")}
          value={date || null}
          min={today}
          locale={format.locale}
          onChange={(v) => {
            setInvalid(false);
            setDate(v ?? "");
          }}
        />
      )}
      {invalid && <Alert variant="warning">{t("availabilitySpecial.series.invalidDate")}</Alert>}
      <RadioGroup
        label={t("availabilitySpecial.series.scopeLabel")}
        name="hours-scope"
        value={scope}
        onChange={(value) => setScope(value as HoursScope)}
      >
        <Radio
          value="only"
          label={t("availabilitySpecial.series.scopeOnly", { date: dateLabel })}
        />
        <Radio
          value="following"
          label={t("availabilitySpecial.hours.scope.following", { date: dateLabel })}
        />
        <Radio value="all" label={t("availabilitySpecial.hours.scope.all")} />
      </RadioGroup>
    </Dialog>
  );
}
