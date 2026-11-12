import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, DatePicker } from "@mattbutlerengineering/rialto";
import type { DateRule } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { coversDate } from "./scope-dates.js";
import type { SeriesScope } from "./series-edit.js";
import { ScopeDialog } from "./ScopeDialog.js";

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

/** Edit on a range or repeating special-hours row asks first, as every scope question does. */
export function SpecialHoursScopeDialog(props: SpecialHoursScopeDialogProps) {
  const { rule, today, initialDate, onChoose, onClose } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const [date, setDate] = useState(initialDate);
  const [invalid, setInvalid] = useState(false);
  const dateLabel = format.formatCalendarDate(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <ScopeDialog
      title={t("availabilitySpecial.hours.scope.title")}
      name="hours-scope"
      dateLabel={dateLabel}
      onClose={onClose}
      onContinue={(scope) => {
        // "All dates" needs no date; the others start from one the rule covers.
        if (scope !== "all" && (date < today || !coversDate(rule, date))) return setInvalid(true);
        onChoose(scope, date);
      }}
      before={(scope) => (
        <>
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
          {invalid && (
            <Alert variant="warning">{t("availabilitySpecial.series.invalidDate")}</Alert>
          )}
        </>
      )}
    />
  );
}
