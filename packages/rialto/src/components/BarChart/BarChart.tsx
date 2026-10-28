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

const NON_FINITE = /^(nan|null|undefined|infinity|-infinity|\+infinity|inf|-inf)$/i;

/**
 * A magnitude the plot can draw, or null when the value is missing or not
 * finite (NaN, null, Infinity, 1e999). Those must not become a zero-height
 * sliver or a tiny bar from a truncated "1".
 */
function chartAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || NON_FINITE.test(trimmed)) return null;
  const numeric = trimmed.replace(/[$,]/g, "");
  if (/e/i.test(numeric)) {
    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const match = numeric.match(/-?\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  let amount = Number(match[0]);
  const suffix = trimmed.slice(-1).toLowerCase();
  if (suffix === "k") amount *= 1_000;
  if (suffix === "m") amount *= 1_000_000;
  if (suffix === "b") amount *= 1_000_000_000;
  return Number.isFinite(amount) ? amount : null;
}

export const BarChart = forwardRef<HTMLElement, BarChartProps>(function BarChart(
  { label, data, className, ...props },
  ref
) {
  const amounts = data.map((datum) => chartAmount(datum.value));
  const finite = amounts.filter((amount): amount is number => amount !== null);
  const hasNegative = finite.some((amount) => amount < 0);
  const maxPositive = Math.max(0, ...finite);
  const min = Math.min(0, ...finite, 0);
  const max = Math.max(0, ...finite, 0);
  const span = max - min || 1;
  const zeroFromBottom = ((0 - min) / span) * 100;

  return (
    <figure ref={ref} className={cn(styles.chart, className)} {...props}>
      <figcaption className={styles.caption}>{label}</figcaption>
      <ul className={styles.plot} aria-label={label}>
        {data.map((datum, index) => {
          const amount = amounts[index] ?? null;
          const missing = amount === null;
          if (!hasNegative) {
            const height = !missing && maxPositive > 0 ? (amount / maxPositive) * 100 : 0;
            return (
              <li key={`${datum.label}:${String(datum.value)}`} className={styles.barItem}>
                {missing ? null : (
                  <span
                    className={styles.bar}
                    style={{ blockSize: `${height}%` }}
                    aria-hidden="true"
                  />
                )}
                <span className={styles.tick}>{datum.label}</span>
                <span className={styles.value}>{String(datum.value)}</span>
              </li>
            );
          }
          const portion = missing ? 0 : (Math.abs(amount) / span) * 100;
          const negative = !missing && amount < 0;
          return (
            <li
              key={`${datum.label}:${String(datum.value)}`}
              className={styles.barItem}
              data-bar={missing ? "missing" : negative ? "negative" : "positive"}
            >
              <span className={styles.track}>
                <span className={styles.baseline} style={{ insetBlockEnd: `${zeroFromBottom}%` }} />
                {missing || amount === 0 ? null : (
                  <span
                    className={styles.signedBar}
                    data-sign={negative ? "negative" : "positive"}
                    style={
                      negative
                        ? {
                            blockSize: `${portion}%`,
                            insetBlockStart: `${100 - zeroFromBottom}%`,
                          }
                        : { blockSize: `${portion}%`, insetBlockEnd: `${zeroFromBottom}%` }
                    }
                    aria-hidden="true"
                  />
                )}
              </span>
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
