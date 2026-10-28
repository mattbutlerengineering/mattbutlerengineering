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

interface ParsedAmount {
  /** The number written in the value, before a k/m/b suffix. */
  base: number;
  multiplier: number;
}

function parseAmount(value: number | string): ParsedAmount {
  if (typeof value === "number") return { base: Number.isFinite(value) ? value : 0, multiplier: 1 };
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match?.[0]) return { base: 0, multiplier: 1 };
  const suffix = value.trim().slice(-1).toLowerCase();
  const multiplier =
    suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  const base = Number(match[0]);
  return { base: Number.isFinite(base) ? base : 0, multiplier };
}

/**
 * Heights for one series. A dashboard often emits the same reading twice:
 * "$142k" beside a plain 142. Applying the suffix makes that bar ~1000× the
 * rest. Ignore the suffix only when the written number matches a plain point
 * in the same series. A real mixed pair ($40 beside $20k) still uses the suffix.
 */
function seriesMagnitudes(parsed: ParsedAmount[]): number[] {
  const plainBases = parsed
    .filter((amount) => amount.multiplier === 1)
    .map((amount) => amount.base);
  return parsed.map((amount) => {
    const scaled = amount.base * amount.multiplier;
    if (amount.multiplier === 1 || plainBases.length === 0) return scaled;
    const duplicatesPlain = plainBases.some((base) => Math.abs(base - amount.base) < 0.001);
    return duplicatesPlain ? amount.base : scaled;
  });
}

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function basesMatch(a: ParsedAmount, b: ParsedAmount): boolean {
  return Math.abs(a.base - b.base) < 0.001;
}

/** Drop a repeated month that is only the suffixed spelling of the next point. */
function withoutDuplicatePoints(data: readonly BarChartDatum[]): BarChartDatum[] {
  const parsed = data.map((datum) => parseAmount(datum.value));
  const drop = new Set<number>();
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data.length; j++) {
      if (i === j) continue;
      const left = data[i];
      const right = data[j];
      const leftAmount = parsed[i];
      const rightAmount = parsed[j];
      if (!left || !right || !leftAmount || !rightAmount || !basesMatch(leftAmount, rightAmount)) {
        continue;
      }
      if (sameLabel(left.label, right.label)) {
        if (leftAmount.multiplier !== rightAmount.multiplier) {
          drop.add(leftAmount.multiplier > rightAmount.multiplier ? i : j);
        }
        continue;
      }
      const word = left.label.trim().split(/\s+/)[0]?.toLowerCase();
      if (
        word &&
        leftAmount.multiplier > rightAmount.multiplier &&
        word !== left.label.trim().toLowerCase() &&
        word === right.label.trim().toLowerCase()
      ) {
        drop.add(i);
      }
    }
  }
  if (drop.size === 0 || drop.size >= data.length) return [...data];
  return data.filter((_, index) => !drop.has(index));
}

export const BarChart = forwardRef<HTMLElement, BarChartProps>(function BarChart(
  { label, data, className, ...props },
  ref
) {
  const points = withoutDuplicatePoints(data);
  const amounts = seriesMagnitudes(points.map((datum) => parseAmount(datum.value)));
  const max = Math.max(0, ...amounts);

  return (
    <figure ref={ref} className={cn(styles.chart, className)} {...props}>
      <figcaption className={styles.caption}>{label}</figcaption>
      <ul className={styles.plot} aria-label={label}>
        {points.map((datum, index) => {
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
