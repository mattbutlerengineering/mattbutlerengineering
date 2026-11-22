import { useTranslation } from "react-i18next";
import { Meter, Text } from "@mattbutlerengineering/rialto";
import type { DashboardStats } from "../../hooks/useDashboardStatsQuery.js";
import styles from "./StatRow.module.css";

/* ── Types ───────────────────────────────────── */

interface StatRowProps {
  readonly stats: DashboardStats;
}

interface CountMetric {
  readonly label: string;
  readonly value: number;
}

/* Cancellation rate is a percentage — a bounded 0-100 metric, so it reads on a
   Meter bar rather than a plain figure. Counts have no ceiling and
   read as numbers. */
const CANCELLATION_MIN = 0;
const CANCELLATION_MAX = 100;

/* ── Component ───────────────────────────────── */

/**
 * The dashboard instrument row: unbounded counts (reservations, covers,
 * upcoming) read as plain figures, while the bounded cancellation-rate
 * percentage reads on a {@link Meter} bar.
 */
export function StatRow({ stats }: StatRowProps) {
  const { t } = useTranslation();
  const counts: readonly CountMetric[] = [
    { label: t("home.stats.reservations"), value: stats.totalReservations },
    { label: t("home.stats.covers"), value: stats.expectedCovers },
    { label: t("home.stats.upcoming"), value: stats.upcomingCount },
    { label: t("home.stats.waitlist"), value: stats.waitlistCount },
    { label: t("home.stats.longestWait"), value: stats.longestWaitMinutes },
  ];

  return (
    <div className={styles.statsRow}>
      {counts.map((metric) => (
        <div key={metric.label} role="group" aria-label={metric.label} className={styles.tile}>
          <Text variant="display" className={styles.figure}>
            {metric.value}
          </Text>
          <Text className={styles.label}>{metric.label}</Text>
        </div>
      ))}

      <div className={styles.tile}>
        <Meter
          label={t("home.stats.cancellationRate")}
          value={stats.cancellationRate}
          min={CANCELLATION_MIN}
          max={CANCELLATION_MAX}
          showValue
          size="sm"
        />
      </div>
    </div>
  );
}
