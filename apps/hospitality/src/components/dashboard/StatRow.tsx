import { Meter, Odometer, Text } from "@mattbutlerengineering/rialto";
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
   Meter bar rather than a rolling counter. Counts have no ceiling and
   roll on Odometers. */
const CANCELLATION_MIN = 0;
const CANCELLATION_MAX = 100;

/* ── Component ───────────────────────────────── */

/**
 * The dashboard instrument row: unbounded counts (reservations, covers,
 * upcoming) roll on {@link Odometer}s, while the bounded cancellation-rate
 * percentage reads on a {@link Meter} bar. Both instruments expose their
 * value as accessible text and honour `prefers-reduced-motion` internally.
 */
export function StatRow({ stats }: StatRowProps) {
  const counts: readonly CountMetric[] = [
    { label: "Today's Reservations", value: stats.totalReservations },
    { label: "Expected Covers", value: stats.expectedCovers },
    { label: "Upcoming (2 hrs)", value: stats.upcomingCount },
  ];

  return (
    <div className={styles.statsRow}>
      {counts.map((metric) => (
        <div key={metric.label} className={styles.tile}>
          <Odometer className={styles.odometer} value={metric.value} aria-label={metric.label} />
          <Text className={styles.label}>{metric.label}</Text>
        </div>
      ))}

      <div className={styles.tile}>
        <Meter
          label="Cancellation Rate"
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
