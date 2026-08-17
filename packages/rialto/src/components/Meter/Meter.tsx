import { forwardRef, type HTMLAttributes } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import styles from "./Meter.module.css";

/**
 * A horizontal gauge bar that visualizes a value within a min/max range.
 * The fill animates to the current fraction using precision easing and respects reduced motion.
 *
 * Pass `value={null}` for "no data". `role="meter"` requires `aria-valuenow`
 * and has no ARIA spelling of "unknown", so the indeterminate case renders as
 * `role="progressbar"` with `aria-valuenow` omitted — the one role whose
 * contract defines an omitted value as indeterminate. Reporting
 * `aria-valuenow="0"` instead would announce a definite zero, and a zeroed
 * gauge and a gauge with no signal are different statements.
 *
 * @example
 * <Meter
 *   label="Fuel Load"
 *   value={72}
 *   max={100}
 *   variant="accent"
 *   showValue
 * />
 *
 * @example
 * // No signal — announces as indeterminate rather than as zero.
 * <Meter label="Fuel Load" value={null} showValue />
 */
export interface MeterProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  /** Current value, or `null` when there is no data to report */
  value: number | null;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Accessible label */
  label?: string;
  /** Fill color variant */
  variant?: "default" | "accent" | "success" | "error";
  /** Show numeric value */
  showValue?: boolean;
  /** Track thickness */
  size?: "sm" | "md";
}

export const Meter = forwardRef<HTMLDivElement, MeterProps>(
  (
    {
      value,
      min = 0,
      max = 100,
      label,
      variant = "default",
      showValue = false,
      size = "md",
      className,
      ...props
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const motionPreset = useMotionPreset();
    const indeterminate = value === null;
    const range = max - min;
    const fraction =
      indeterminate || range <= 0 ? 0 : Math.min(1, Math.max(0, (value - min) / range));
    const percent = Math.round(fraction * 100);

    const trackClass = cn(
      styles.track,
      size === "sm" && styles.trackSm,
      indeterminate && styles.indeterminate
    );

    const fillClass = cn(styles.fill, styles[variant]);

    return (
      <div ref={ref} className={cn(styles.wrapper, className)} {...props}>
        {(label || showValue) && (
          <div className={styles.labelRow}>
            {label && <span className={styles.label}>{label}</span>}
            {showValue && (
              <span className={styles.value}>{indeterminate ? "\u2013\u2013" : `${percent}%`}</span>
            )}
          </div>
        )}
        <div
          className={trackClass}
          role={indeterminate ? "progressbar" : "meter"}
          aria-valuenow={indeterminate ? undefined : value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-label={label}
        >
          {!indeterminate && (
            <motion.div
              className={fillClass}
              initial={shouldReduceMotion ? { scaleX: fraction } : { scaleX: 0 }}
              animate={{ scaleX: fraction }}
              transition={motionPreset.precision}
            />
          )}
        </div>
      </div>
    );
  }
);

Meter.displayName = "Meter";
