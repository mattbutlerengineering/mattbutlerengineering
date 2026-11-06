import { useTranslation } from "react-i18next";
import { Checkbox } from "@mattbutlerengineering/rialto";
import type { AlsoApplyOption, AlsoApplyPicks } from "./also-apply.js";
import styles from "./AlsoApplyTo.module.css";

/**
 * "Also apply to Dinner in: ☐ Weekend ☐ Summer hours" (ux.md F-X step 4): one group per edited
 * service, listing the other schedules that run it. Nothing is ticked until the Manager asks.
 */
export function AlsoApplyTo(props: {
  readonly options: readonly AlsoApplyOption[];
  readonly picks: AlsoApplyPicks;
  readonly onChange: (picks: AlsoApplyPicks) => void;
}) {
  const { options, picks, onChange } = props;
  const { t } = useTranslation();
  if (options.length === 0) return null;
  const toggle = (venueServiceId: string, scheduleId: string, on: boolean) => {
    const current = picks[venueServiceId] ?? [];
    const next = on ? [...current, scheduleId] : current.filter((id) => id !== scheduleId);
    onChange({ ...picks, [venueServiceId]: next });
  };
  return (
    <>
      {options.map((option) => (
        <fieldset key={option.venueServiceId} className={styles.group}>
          <legend className={styles.legend}>
            {t("availabilitySchedules.alsoApply.legend", { service: option.serviceName })}
          </legend>
          <div className={styles.row}>
            {option.targets.map((target) => (
              <Checkbox
                key={target.scheduleId}
                label={target.scheduleName}
                checked={(picks[option.venueServiceId] ?? []).includes(target.scheduleId)}
                onCheckedChange={(on) => toggle(option.venueServiceId, target.scheduleId, on)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}
