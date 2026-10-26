import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Radio, RadioGroup } from "@mattbutlerengineering/rialto";
import type { SeriesScope } from "./series-edit.js";
import styles from "./CloseDialog.module.css";

/** Which dates of a range or repeating special-hours rule an edit reaches (ux.md F-SER step 2). */
export type HoursScope = "only" | SeriesScope;

export interface SpecialHoursScopeDialogProps {
  /** The date "Only this date" and "This and following" start from, formatted. */
  readonly dateLabel: string;
  readonly onChoose: (scope: HoursScope) => void;
  readonly onClose: () => void;
}

/** Edit on a range or repeating special-hours row asks first, as the closure series dialog does. */
export function SpecialHoursScopeDialog(props: SpecialHoursScopeDialogProps) {
  const { dateLabel, onChoose, onClose } = props;
  const { t } = useTranslation();
  const [scope, setScope] = useState<HoursScope>("only");

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
          <Button variant="primary" onClick={() => onChoose(scope)}>
            {t("availabilitySpecial.hours.scope.continue")}
          </Button>
        </div>
      }
    >
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
