import { forwardRef, type HTMLAttributes } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../utils/class-composer";
import styles from "./NeonSign.module.css";

/**
 * Trading state the sign shows.
 * - `open` — the tube is lit with the success token and strikes on when entered.
 * - `opening-soon` — the tube warms gold and breathes; doors open within the lead window.
 * - `closed` — dark glass on the plate.
 * - `unset` — no tube, dashed outline: hours were never configured.
 */
export type NeonSignState = "open" | "opening-soon" | "closed" | "unset";

/**
 * Instrument that shows whether a venue is trading right now — a neon tube
 * spelling OPEN mounted on a recessed housing, with the fact stated in words
 * beneath it. The tube is lit green while open, warms gold while opening
 * soon (the one place the accent appears), sits dark when closed, and is
 * absent altogether when no hours are set.
 *
 * It owns no clock and no timezone: the consumer derives `state` and the
 * label; the instrument prints `OPEN` and whatever `aria-label` it is given.
 * Motion is CSS keyframes bound to `data-state`, so the strike-on needs no
 * React state or effect.
 *
 * Renders as a single `role="img"` — housing, tube and caption are decorative
 * and assistive tech hears only the required `aria-label`.
 *
 * @example
 * <NeonSign state="open" aria-label="Open until 10:00 PM" />
 */
export interface NeonSignProps extends Omit<HTMLAttributes<HTMLDivElement>, "aria-label"> {
  /** Accessible name — required because the component renders as role="img". Also the visible caption. */
  "aria-label": string;
  /** Trading state the tube shows. Required: a sign with no state would be a lie. */
  state: NeonSignState;
  /** Print the accessible name as a caption beneath the housing. @default true */
  showCaption?: boolean;
  /** Tube, housing padding and caption scale together. @default "md" */
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASS = { sm: styles.sizeSm, md: styles.sizeMd, lg: styles.sizeLg } as const;

/** The tube spells one word; a dark OPEN reads as closed by shop-window convention. */
const TUBE_WORD = "OPEN";

export const NeonSign = forwardRef<HTMLDivElement, NeonSignProps>(
  (
    { "aria-label": ariaLabel, state, showCaption = true, size = "md", className, ...rest },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion() ?? false;
    const lit = state === "open" || state === "opening-soon";

    const rootClass = cn(
      styles.neonSign,
      SIZE_CLASS[size],
      shouldReduceMotion && styles.reduced,
      className
    );

    return (
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        data-state={state}
        data-reduced-motion={shouldReduceMotion}
        className={rootClass}
        {...rest}
      >
        <div className={styles.housing} aria-hidden="true">
          <span className={styles.tube} data-tube="true" data-lit={lit}>
            {TUBE_WORD}
          </span>
        </div>
        {showCaption && (
          <span className={styles.caption} aria-hidden="true">
            {ariaLabel}
          </span>
        )}
      </div>
    );
  }
);

NeonSign.displayName = "NeonSign";
