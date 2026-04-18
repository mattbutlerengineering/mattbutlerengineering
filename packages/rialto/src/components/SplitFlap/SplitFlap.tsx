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
  const [current, setCurrent] = useState(" ");
  const [prevChar, setPrevChar] = useState(" ");
  const currentRef = useRef(" ");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    if (currentRef.current === target) return;
    if (instant) {
      setPrevChar(currentRef.current);
      currentRef.current = target;
      setCurrent(target);
      return;
    }

    // Step forward one char per flipInterval until we land on target.
    // currentRef is the synchronous source of truth so we never schedule
    // from inside a setState updater (which StrictMode may double-invoke).
    const step = () => {
      if (currentRef.current === target) return;
      const outgoing = currentRef.current;
      const next = nextChar(outgoing, charset);
      currentRef.current = next;
      setPrevChar(outgoing);
      setCurrent(next);
      timerRef.current = setTimeout(step, flipInterval);
    };

    timerRef.current = setTimeout(step, startDelay);
    return clearTimer;
  }, [target, charset, flipInterval, startDelay, instant, clearTimer]);

  return (
    <div className={styles.cell} aria-hidden="true">
      {/* Bottom half — shows CURRENT char's bottom. Visible behind the flap
          and also while the flap is actively falling (acceptable transient
          since the flap front covers the top half during that moment). */}
      <div className={styles.half} data-position="bottom">
        <span>{current}</span>
      </div>

      {/* Top half — shows CURRENT char's top. Hidden under the flap front
          during the fall, revealed once the flap rotates past 90°. */}
      <div className={styles.half} data-position="top">
        <span>{current}</span>
      </div>

      {/* Seam line across the middle */}
      <div className={styles.seam} />

      {/* Animated flap — rotates 0 → -180, front shows outgoing char's top,
          back shows incoming char's top (rotated 180° so it reads upright) */}
      <motion.div
        key={current}
        className={styles.flap}
        initial={{ rotateX: 0 }}
        animate={{ rotateX: -180 }}
        transition={{ duration: flipInterval / 1000, ease: "easeIn" }}
      >
        <div className={styles.flapFace} data-face="front">
          <span>{prevChar}</span>
        </div>
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
