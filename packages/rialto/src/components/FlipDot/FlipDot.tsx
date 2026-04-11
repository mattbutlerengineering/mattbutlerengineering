import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useRef,
  type HTMLAttributes,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { spring, reduced } from "../../tokens/motion";
import { useFlipDotSound } from "./use-flip-dot-sound";
import styles from "./FlipDot.module.css";

// ── Types ─────────────────────────────────────

export type StaggerDirection =
  | "left-to-right"
  | "top-to-bottom"
  | "center-out"
  | "random";

export interface FlipDotProps extends HTMLAttributes<HTMLDivElement> {
  /** 2D boolean grid — `true` = on (bright), `false` = off (dark). Outer array = rows. */
  matrix: readonly (readonly boolean[])[];
  /** Override column count. Matrix is padded/truncated to fit. */
  cols?: number;
  /** Override row count. Matrix is padded/truncated to fit. */
  rows?: number;
  /** Dot diameter in px. @default 8 */
  dotSize?: number;
  /** Gap between dots in px. @default 3 */
  dotGap?: number;
  /** Enable mechanical click sound. @default false */
  enableSound?: boolean;
  /** Sound volume 0–1. @default 0.3 */
  soundVolume?: number;
  /** Base stagger delay between dots in ms. @default 8 */
  staggerDelay?: number;
  /** Random jitter factor (0–1) added to stagger timing. @default 0.4 */
  staggerJitter?: number;
  /** Direction of the flip cascade. @default "left-to-right" */
  staggerDirection?: StaggerDirection;
}

// ── Stagger delay calculation ────────────────

function computeDelay(
  row: number,
  col: number,
  totalRows: number,
  totalCols: number,
  direction: StaggerDirection,
  baseDelay: number,
  jitter: number,
): number {
  let positional: number;

  switch (direction) {
    case "left-to-right":
      positional = col + row * 0.3;
      break;
    case "top-to-bottom":
      positional = row + col * 0.3;
      break;
    case "center-out": {
      const centerRow = (totalRows - 1) / 2;
      const centerCol = (totalCols - 1) / 2;
      positional = Math.abs(row - centerRow) + Math.abs(col - centerCol);
      break;
    }
    case "random":
      positional = Math.random() * Math.max(totalRows, totalCols);
      break;
  }

  const jitterOffset = Math.random() * jitter * baseDelay;
  return (positional * baseDelay + jitterOffset) / 1000; // convert to seconds
}

// ── Normalise matrix to exact dimensions ─────

function normaliseMatrix(
  matrix: readonly (readonly boolean[])[],
  rows: number,
  cols: number,
): readonly (readonly boolean[])[] {
  return Array.from({ length: rows }, (_, r) => {
    const srcRow = matrix[r];
    return Array.from({ length: cols }, (__, c) =>
      srcRow ? (srcRow[c] ?? false) : false,
    );
  });
}

// ── Individual dot ───────────────────────────

interface FlipDotDotProps {
  on: boolean;
  delay: number;
  reduceMotion: boolean;
  onFlip?: () => void;
}

const FlipDotDot = memo(function FlipDotDot({
  on,
  delay,
  reduceMotion,
  onFlip,
}: FlipDotDotProps) {
  const prevOn = useRef(on);

  useEffect(() => {
    if (prevOn.current !== on) {
      prevOn.current = on;
      onFlip?.();
    }
  }, [on, onFlip]);

  return (
    <div className={styles.dot}>
      <motion.div
        className={styles.dotInner}
        animate={{ rotateX: on ? 180 : 0 }}
        transition={
          reduceMotion
            ? reduced
            : { ...spring, delay }
        }
      >
        <div className={styles.dotOff} />
        <div className={styles.dotOn} />
      </motion.div>
    </div>
  );
});

// ── Main component ───────────────────────────

export const FlipDot = forwardRef<HTMLDivElement, FlipDotProps>(
  (
    {
      matrix,
      cols,
      rows,
      dotSize = 8,
      dotGap = 3,
      enableSound = false,
      soundVolume = 0.3,
      staggerDelay = 8,
      staggerJitter = 0.4,
      staggerDirection = "left-to-right",
      className,
      style,
      ...rest
    },
    ref,
  ) => {
    const shouldReduceMotion = useReducedMotion() ?? false;
    const { playBatchClick } = useFlipDotSound({
      enabled: enableSound,
      volume: soundVolume,
    });

    // Resolve final dimensions
    const effectiveRows = rows ?? matrix.length;
    const effectiveCols = cols ?? (matrix[0]?.length ?? 0);
    const grid = normaliseMatrix(matrix, effectiveRows, effectiveCols);

    // Batch sound: collect flips within a single rAF
    const flipCountRef = useRef(0);
    const rafRef = useRef(0);

    const handleFlip = useCallback(() => {
      flipCountRef.current += 1;
      if (rafRef.current === 0) {
        rafRef.current = requestAnimationFrame(() => {
          if (flipCountRef.current > 0) {
            playBatchClick(flipCountRef.current);
          }
          flipCountRef.current = 0;
          rafRef.current = 0;
        });
      }
    }, [playBatchClick]);

    useEffect(() => {
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, []);

    return (
      <div
        ref={ref}
        role="img"
        className={[styles.panel, className].filter(Boolean).join(" ")}
        style={{
          gridTemplateColumns: `repeat(${effectiveCols}, var(--fd-dot-size))`,
          "--fd-dot-size": `${dotSize}px`,
          "--fd-dot-gap": `${dotGap}px`,
          ...style,
        } as React.CSSProperties}
        {...rest}
      >
        {grid.map((row, r) =>
          row.map((on, c) => (
            <FlipDotDot
              key={`${r}-${c}`}
              on={on}
              delay={computeDelay(
                r,
                c,
                effectiveRows,
                effectiveCols,
                staggerDirection,
                staggerDelay,
                staggerJitter,
              )}
              reduceMotion={shouldReduceMotion}
              onFlip={enableSound ? handleFlip : undefined}
            />
          )),
        )}
      </div>
    );
  },
);

FlipDot.displayName = "FlipDot";
