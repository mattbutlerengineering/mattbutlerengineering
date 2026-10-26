import { useTranslation } from "react-i18next";
import { Input, Text } from "@mattbutlerengineering/rialto";
import type { StaffCheckResult } from "../../hooks/useStaffBookingCheck.js";
import styles from "./NewReservationDialog.module.css";

interface StaffCheckNoticeProps {
  check: StaffCheckResult;
  reason: string;
  onReasonChange: (reason: string) => void;
  disabled?: boolean;
}

/** What the live check says under the time field: progress, a soft-limit reason prompt, a hard block, or the fallback note. */
export function StaffCheckNotice({
  check,
  reason,
  onReasonChange,
  disabled,
}: StaffCheckNoticeProps) {
  const { t } = useTranslation();
  const { phase, verdict } = check;

  if (phase === "checking") {
    return (
      <Text color="secondary" role="status">
        {t("newReservation.check.checking")}
      </Text>
    );
  }
  if (phase === "failed") {
    return (
      <Text color="secondary" role="status">
        {t("newReservation.check.failed")}
      </Text>
    );
  }
  if (verdict?.kind === "hard") {
    return (
      <div role="alert" className={styles.errorBanner}>
        {t("newReservation.check.hardHeading", { message: verdict.message })}
      </div>
    );
  }
  if (verdict?.kind === "soft") {
    const limits = verdict.limits.map((l) => t(`newReservation.check.limit.${l}`)).join(", ");
    return (
      <div className={styles.softNotice}>
        <Text role="status">
          {t("newReservation.check.softHeading", { count: verdict.limits.length, limits })}
        </Text>
        <Input
          label={t("newReservation.check.reasonLabel")}
          placeholder={t("newReservation.check.reasonPlaceholder")}
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    );
  }
  return null;
}
