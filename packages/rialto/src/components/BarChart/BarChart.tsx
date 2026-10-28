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

interface ParsedAmount {
  /** The number written in the value, before a k/m/b suffix. */
  base: number;
  multiplier: number;
}

function suffixMultiplier(suffix: string): number {
  if (suffix === "k") return 1_000;
  if (suffix === "m") return 1_000_000;
  if (suffix === "b") return 1_000_000_000;
  return 1;
}

/**
 * The written number and its k/m/b scale, or null when the value is missing
 * or not finite (NaN, null, Infinity, 1e999). Those must not become a
 * zero-height sliver or a tiny bar from a truncated "1".
 */
function parseAmount(value: unknown): ParsedAmount | null {
  if (value == null) return null;
  if (typeof value === "number")
    return Number.isFinite(value) ? { base: value, multiplier: 1 } : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || NON_FINITE.test(trimmed)) return null;
  const numeric = trimmed.replace(/[$,]/g, "");
  // Only a whole exponent literal: "12 tickets" or "8 sales" read by their digits.
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(numeric)) {
    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? { base: parsed, multiplier: 1 } : null;
  }
  const match = numeric.match(/-?\d+(?:\.\d+)?/);
  if (!match?.[0]) return null;
  const base = Number(match[0]);
  // A suffix counts only right after the number (one space allowed) and not as
  // the start of a word: "$20k", "12 k" scale; "5 per week", "12 kg" do not.
  const tail = numeric.slice((match.index ?? 0) + match[0].length);
  const suffix = tail.match(/^ ?([kmb])(?![a-z])/i)?.[1] ?? "";
  const multiplier = suffixMultiplier(suffix.toLowerCase());
  return Number.isFinite(base * multiplier) ? { base, multiplier } : null;
}

function basesMatch(a: ParsedAmount, b: ParsedAmount): boolean {
  return Math.abs(a.base - b.base) < 0.001;
}

/**
 * Heights for one series. A dashboard often emits the same reading twice:
 * "$142k" beside a plain 142. Applying the suffix makes that bar ~1000× the
 * rest. Ignore the suffix only when the written number matches a plain point
 * in the same series. A real mixed pair ($40 beside $20k) still uses the suffix.
 */
function seriesMagnitudes(parsed: (ParsedAmount | null)[]): (number | null)[] {
  const plain = parsed.filter(
    (amount): amount is ParsedAmount => amount !== null && amount.multiplier === 1
  );
  return parsed.map((amount) => {
    if (amount === null) return null;
    const scaled = amount.base * amount.multiplier;
    if (amount.multiplier === 1 || plain.length === 0) return scaled;
    return plain.some((other) => basesMatch(other, amount)) ? amount.base : scaled;
  });
}

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Drop a repeated month that is only the suffixed spelling of another point. */
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
        {points.map((datum, index) => {
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
