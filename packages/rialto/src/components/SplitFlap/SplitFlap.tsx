import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CHARSETS, normalizeChar, nextChar, type CharsetName } from "./charset";
import styles from "./SplitFlap.module.css";

/**
 * A Solari-style split-flap character display. Each cell mechanically cycles
 * through its character set to arrive at the target character, producing the
 * characteristic cascade of falling flaps.
 *
 * @example
 * <SplitFlap value="ARRIVED" aria-label="Flight status: arrived" />
 * <SplitFlap value="GATE 12" charset="full" size="lg" />
 */
export interface SplitFlapProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "aria-label"> {
  /** The text to display. Characters not in the charset render as spaces. */
  value: string;
  /** Accessible name — required because the component renders as role="img". */
  "aria-label": string;
  /** Character set the cells can cycle through. @default "alphanumeric" */
  charset?: CharsetName;
  /** Fixed cell count — pads value with spaces or truncates to fit. */
  length?: number;
  /** Cell size preset. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Ms between each intermediate flip within a single cell. @default 80 */
  flipInterval?: number;
  /** Ms delay before each subsequent cell starts its cycle. @default 40 */
  cascadeDelay?: number;
}

export const SplitFlap = forwardRef<HTMLDivElement, SplitFlapProps>(
  (
    {
      value,
      "aria-label": ariaLabel,
      charset = "alphanumeric",
      length,
      size = "md",
      flipInterval = 80,
      cascadeDelay = 40,
      className,
      ...rest
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const charsetStr = CHARSETS[charset];

    // Compute the sequence of target chars — padded/truncated to `length`.
    const targetChars = normalizeValue(value, length, charsetStr);

    const wrapperClass = [styles.board, styles[size], className]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        className={wrapperClass}
        {...rest}
      >
        {targetChars.map((target, i) => (
          <SplitFlapCell
            key={i}
            target={target}
            charset={charsetStr}
            flipInterval={flipInterval}
            startDelay={i * cascadeDelay}
            instant={shouldReduceMotion ?? false}
          />
        ))}

        {/* Visually hidden — AT reads ariaLabel, not the animated cells */}
        <span className={styles.srOnly} aria-hidden="true">
          {targetChars.join("")}
        </span>
      </div>
    );
  }
);

SplitFlap.displayName = "SplitFlap";

/* ── Cell ───────────────────────────────────── */

interface SplitFlapCellProps {
  target: string;
  charset: string;
  flipInterval: number;
  startDelay: number;
  instant: boolean;
}

const SplitFlapCell = memo(function SplitFlapCell({
  target,
  charset,
  flipInterval,
  startDelay,
  instant,
}: SplitFlapCellProps) {
  const [current, setCurrent] = useState(target);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flipKey, setFlipKey] = useState(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (current === target) return;
    if (instant) {
      setCurrent(target);
      return;
    }

    // Kick off the cycle after startDelay, then step forward one char
    // per flipInterval until we land on the target.
    const step = () => {
      setCurrent((c) => {
        if (c === target) return c;
        const next = nextChar(c, charset);
        setFlipKey((k) => k + 1);
        timerRef.current = setTimeout(step, flipInterval);
        return next;
      });
    };

    timerRef.current = setTimeout(step, startDelay);
    return clearTimer;
    // We intentionally exclude `current` — we only want to re-kick when the
    // target changes. The closure reads the latest value via setCurrent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, charset, flipInterval, startDelay, instant, clearTimer]);

  // Cleanup on unmount
  useEffect(() => clearTimer, [clearTimer]);

  return (
    <div className={styles.cell} aria-hidden="true">
      {/* Bottom half — stable, shows current character's bottom half */}
      <div className={styles.half} data-position="bottom">
        <span>{current}</span>
      </div>

      {/* Top half — shows current character's top half */}
      <div className={styles.half} data-position="top">
        <span>{current}</span>
      </div>

      {/* Seam line across the middle */}
      <div className={styles.seam} />

      {/* Animated flap — rotates from 0 to -180 on each character change */}
      <motion.div
        key={flipKey}
        className={styles.flap}
        initial={{ rotateX: 0 }}
        animate={{ rotateX: -180 }}
        transition={{ duration: flipInterval / 1000, ease: "easeIn" }}
      >
        {/* Front face — the outgoing character's top half */}
        <div className={styles.flapFace} data-face="front">
          <span>{current}</span>
        </div>
        {/* Back face — the incoming character's bottom half, inverted */}
        <div className={styles.flapFace} data-face="back">
          <span>{current}</span>
        </div>
      </motion.div>
    </div>
  );
});

/* ── Helpers ────────────────────────────────── */

function normalizeValue(value: string, length: number | undefined, charset: string): string[] {
  const chars = [...value].map((c) => normalizeChar(c, charset));
  if (length == null) return chars;
  if (chars.length >= length) return chars.slice(0, length);
  return chars.concat(Array.from({ length: length - chars.length }, () => " "));
}
