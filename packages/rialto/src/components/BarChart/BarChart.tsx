import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../utils/class-composer";
import styles from "./BarChart.module.css";

export interface BarChartDatum {
  /** Tick label, such as a month. */
  label: string;
  /** Bar magnitude. A formatted string such as "$18.2k" is accepted. */
  value: number | string;
}

/**
 * Vertical bars for a short trend (revenue by month, signups by week).
 * Prefer this over a paragraph of numbers.
 */
export interface BarChartProps extends HTMLAttributes<HTMLElement> {
  /** Accessible name, shown as the caption. */
  label: string;
  data: readonly BarChartDatum[];
}

function numericValue(value: number | string): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  let amount = Number(match[0]);
  const suffix = value.trim().slice(-1).toLowerCase();
  if (suffix === "k") amount *= 1_000;
  if (suffix === "m" || suffix === "b") amount *= suffix === "m" ? 1_000_000 : 1_000_000_000;
  return Number.isFinite(amount) ? amount : 0;
}

export const BarChart = forwardRef<HTMLElement, BarChartProps>(function BarChart(
  { label, data, className, ...props },
  ref
) {
  const amounts = data.map((datum) => numericValue(datum.value));
  const max = Math.max(0, ...amounts);

  return (
    <figure ref={ref} className={cn(styles.chart, className)} {...props}>
      <figcaption className={styles.caption}>{label}</figcaption>
      <ul className={styles.plot} aria-label={label}>
        {data.map((datum, index) => {
          const amount = amounts[index] ?? 0;
          const height = max > 0 ? (amount / max) * 100 : 0;
          return (
            <li key={`${datum.label}:${String(datum.value)}`} className={styles.barItem}>
              <span className={styles.bar} style={{ blockSize: `${height}%` }} aria-hidden="true" />
              <span className={styles.tick}>{datum.label}</span>
              <span className={styles.value}>{String(datum.value)}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
});

BarChart.displayName = "BarChart";
