import { forwardRef, useMemo, type HTMLAttributes } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { springGentle, reduced } from "../../tokens/motion";
import { cn } from "../../utils/class-composer";
import { SplitFlap } from "../SplitFlap";
import styles from "./Odometer.module.css";

/**
 * A mechanical rolling-counter. Reads a numeric `value`, formats it with locale
 * grouping via `Intl.NumberFormat`, and animates digit changes by composing the
 * {@link SplitFlap} primitive — each contiguous run of digits becomes a reel
 * that rolls to its target, extending SplitFlap's Solari physics to numbers.
 *
 * Grouping separators (`,` `.` currency symbols, sign) render as static glyphs
 * between the reels. On each value change the reel block re-settles with the
 * token spring; `prefers-reduced-motion` snaps to the final value with no roll
 * (SplitFlap honors it internally, and the container skips its settle).
 *
 * Accessibility: the animated reels are decorative and hidden from assistive
 * tech. A single polite, atomic live region announces the whole formatted
 * number — never per-digit. Any `aria-label`/`aria-labelledby` you pass names
 * that live region (not just the role-less wrapper), so screen readers announce
 * the label with the value. Pairs naturally with `Stat` and hero metrics.
 *
 * @example
 * <Odometer value={128_540} aria-label="Total signups" />
 * <Odometer value={1234.5} formatOptions={{ style: "currency", currency: "USD" }} />
 */
export interface OdometerProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** The numeric value to display. Reels roll to match on change. */
  value: number;
  /** BCP-47 locale(s) for `Intl.NumberFormat`. @default runtime default locale */
  locale?: string | string[];
  /** `Intl.NumberFormat` options — grouping, currency, fraction digits, etc. */
  formatOptions?: Intl.NumberFormatOptions;
  /** Reel size preset — forwarded to SplitFlap. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Ms between each intermediate flip within a reel. @default 60 */
  flipInterval?: number;
  /** Ms delay before each subsequent digit in a reel starts. @default 30 */
  cascadeDelay?: number;
}

/* ── Tokenization ───────────────────────────── */

interface OdometerToken {
  readonly kind: "digits" | "separator";
  readonly text: string;
}

/**
 * Split a formatted number into alternating runs of ASCII digits and
 * everything else (grouping separators, decimal points, currency, sign).
 * Digit runs become animated reels; the rest render as static glyphs.
 */
function tokenize(formatted: string): OdometerToken[] {
  const runs = formatted.match(/\d+|\D+/g);
  if (!runs) return [];
  return runs.map((text) => ({
    kind: /^\d+$/.test(text) ? "digits" : "separator",
    text,
  }));
}

export const Odometer = forwardRef<HTMLDivElement, OdometerProps>(
  (
    {
      value,
      locale,
      formatOptions,
      size = "md",
      flipInterval = 60,
      cascadeDelay = 30,
      className,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      ...rest
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();

    const formatted = useMemo(
      () => new Intl.NumberFormat(locale, formatOptions).format(value),
      [locale, formatOptions, value]
    );
    const tokens = useMemo(() => tokenize(formatted), [formatted]);

    return (
      <div
        ref={ref}
        className={cn(styles.odometer, styles[size], className)}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        {...rest}
      >
        {/* Decorative reels — remounts on value change so the token spring
            re-settles the block while each SplitFlap reel rolls to target. */}
        <motion.div
          key={formatted}
          className={styles.reels}
          aria-hidden="true"
          initial={shouldReduceMotion ? false : { scale: 0.98, opacity: 0.85 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={shouldReduceMotion ? reduced : springGentle}
        >
          {tokens.map((token, i) =>
            token.kind === "digits" ? (
              <SplitFlap
                key={i}
                value={token.text}
                charset="numeric"
                size={size}
                flipInterval={flipInterval}
                cascadeDelay={cascadeDelay}
                aria-label=" "
              />
            ) : (
              <span key={i} className={styles.separator}>
                {token.text}
              </span>
            )
          )}
        </motion.div>

        {/* The sole accessible surface — announces the whole value, not digits. */}
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={styles.srOnly}
        >
          {formatted}
        </span>
      </div>
    );
  }
);

Odometer.displayName = "Odometer";
