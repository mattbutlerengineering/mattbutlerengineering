import { forwardRef, useEffect, useState, type HTMLAttributes } from "react";
import { useReducedMotion } from "framer-motion";
import { SplitFlap } from "../SplitFlap/SplitFlap";
import type { CharsetName } from "../SplitFlap/charset";
import { cn } from "../../utils/class-composer";
import styles from "./DepartureBoard.module.css";

/**
 * A split-flap departure board that flips through a sequence of headlines or
 * value-props — the signature marketing hero. It composes {@link SplitFlap}
 * (no fork) for the mechanical flap animation, cycling the board through each
 * phrase on a timer.
 *
 * Respecting `prefers-reduced-motion`, it renders the current phrase as plain
 * static text and stops auto-advancing. In every mode the current phrase is
 * exposed to assistive technology while the decorative flap glyphs are hidden.
 *
 * @example
 * <DepartureBoard phrases={["MAKE IT REAL", "SHIP THE FUTURE"]} />
 * <DepartureBoard phrases={headlines} holdMs={4000} size="lg" />
 */
export interface DepartureBoardProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Ordered phrases the board cycles through. Characters outside the charset render as spaces. */
  phrases: string[];
  /** Ms each phrase is held before the board flips to the next. @default 3200 */
  holdMs?: number;
  /** Ms between each intermediate flip within a single cell (passed to SplitFlap). @default 70 */
  flipInterval?: number;
  /** Ms delay before each subsequent cell begins its flip cascade (passed to SplitFlap). @default 35 */
  cascadeDelay?: number;
  /** Character set the flap cells can cycle through. @default "full" */
  charset?: CharsetName;
  /** Cell size preset. @default "lg" */
  size?: "sm" | "md" | "lg";
  /** Fixed cell count — pads/truncates every phrase to this width. Defaults to the longest phrase. */
  length?: number;
}

export const DepartureBoard = forwardRef<HTMLDivElement, DepartureBoardProps>(
  (
    {
      phrases,
      holdMs = 3200,
      flipInterval = 70,
      cascadeDelay = 35,
      charset = "full",
      size = "lg",
      length,
      className,
      ...rest
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion() ?? false;
    const [index, setIndex] = useState(0);

    const count = phrases.length;
    const activeIndex = count > 0 ? index % count : 0;
    const currentPhrase = phrases[activeIndex] ?? "";

    // Fixed board width so cells never reflow between phrases of different lengths.
    const cellCount = length ?? phrases.reduce((max, p) => Math.max(max, p.length), 0);

    useEffect(() => {
      if (shouldReduceMotion || count <= 1) return;
      const timer = setInterval(() => {
        setIndex((i) => (i + 1) % count);
      }, holdMs);
      return () => clearInterval(timer);
    }, [shouldReduceMotion, count, holdMs]);

    // Reduced motion: a fully static, readable phrase — no flipping, no cycling.
    if (shouldReduceMotion) {
      return (
        <div ref={ref} className={cn(styles.board, styles[size], styles.static, className)} {...rest}>
          <span className={styles.staticText}>{currentPhrase}</span>
        </div>
      );
    }

    return (
      <div ref={ref} className={cn(styles.board, styles[size], className)} {...rest}>
        {/* AT hears the phrase; the flap glyphs below are decorative. */}
        <span className={styles.srOnly} role="status">
          {currentPhrase}
        </span>
        <div className={styles.display} aria-hidden="true">
          <SplitFlap
            value={currentPhrase}
            aria-label={currentPhrase}
            charset={charset}
            length={cellCount}
            size={size}
            flipInterval={flipInterval}
            cascadeDelay={cascadeDelay}
          />
        </div>
      </div>
    );
  }
);

DepartureBoard.displayName = "DepartureBoard";
