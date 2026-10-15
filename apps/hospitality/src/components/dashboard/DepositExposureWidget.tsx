import { useTranslation } from "react-i18next";
import { Card, Text } from "@mattbutlerengineering/rialto";
import { formatCurrencyFromCents } from "../../utils/format.js";
import styles from "./DepositExposureWidget.module.css";

interface DepositExposureWidgetProps {
  readonly depositAtRiskCount: number;
  readonly noShowExposureCents: number;
  readonly currency: string;
}

export function DepositExposureWidget({
  depositAtRiskCount,
  noShowExposureCents,
  currency,
}: DepositExposureWidgetProps) {
  const { t, i18n } = useTranslation();
  return (
    <Card title={t("home.deposit.title")}>
      <div className={styles.row}>
        <Text className={styles.value}>{depositAtRiskCount}</Text>
        <Text className={styles.label}>{t("home.deposit.atRisk")}</Text>
      </div>
      <div className={styles.row}>
        <Text className={styles.value}>
          {formatCurrencyFromCents(noShowExposureCents, currency, i18n.language)}
        </Text>
        <Text className={styles.label}>{t("home.deposit.noShowExposure")}</Text>
      </div>
    </Card>
  );
}
