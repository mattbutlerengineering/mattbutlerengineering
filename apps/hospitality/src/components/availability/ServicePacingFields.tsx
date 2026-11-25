import { useTranslation } from "react-i18next";
import { Input, Select } from "@mattbutlerengineering/rialto";
import type { ServicePacing } from "./quick-setup-draft.js";
import styles from "./QuickSetupForm.module.css";

/** The windows a cap can count covers over; a stored one that is not here is still shown. */
export const PACING_WINDOWS = [15, 30, 60, 90, 120] as const;
const DEFAULT_WINDOW = 30;

export interface ServicePacingFieldsProps {
  readonly pacing: ServicePacing | undefined;
  readonly onChange: (next: ServicePacing | undefined) => void;
  /** Prefix of the field ids, unique per service on the page. */
  readonly idScope: string;
}

/**
 * A service's own pacing cap: most covers seated per window. It can only lower what the venue and
 * Tonight already allow. Empty means no cap of its own. Digits only, so a cap is a whole number.
 */
export function ServicePacingFields({ pacing, onChange, idScope }: ServicePacingFieldsProps) {
  const { t } = useTranslation();
  const windowMinutes = pacing?.windowMinutes ?? DEFAULT_WINDOW;
  const windows = PACING_WINDOWS.some((n) => n === windowMinutes)
    ? PACING_WINDOWS
    : [...PACING_WINDOWS, windowMinutes].sort((a, b) => a - b);
  const covers = pacing?.covers ?? "";
  return (
    <div className={styles.pacing}>
      <Input
        id={`${idScope}-pacing-covers`}
        label={t("availability.quickSetup.pacing.covers")}
        hint={t("availability.quickSetup.pacing.hint")}
        inputMode="numeric"
        value={covers}
        maxLength={3}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
          onChange(digits === "" ? undefined : { covers: digits, windowMinutes });
        }}
      />
      {covers !== "" && (
        <Select
          id={`${idScope}-pacing-window`}
          label={t("availability.quickSetup.pacing.window")}
          value={String(windowMinutes)}
          options={windows.map((n) => ({
            value: String(n),
            label: t("availabilityHub.serviceFields.minutes", { minutes: n }),
          }))}
          onChange={(value) => onChange({ covers, windowMinutes: Number(value) })}
        />
      )}
    </div>
  );
}
