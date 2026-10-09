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
  return (
    <Card title="Deposit Exposure">
      <div className={styles.row}>
        <Text className={styles.value}>{depositAtRiskCount}</Text>
        <Text className={styles.label}>Deposits at risk</Text>
      </div>
      <div className={styles.row}>
        <Text className={styles.value}>
          {formatCurrencyFromCents(noShowExposureCents, currency)}
        </Text>
        <Text className={styles.label}>No-show exposure</Text>
      </div>
    </Card>
  );
}
