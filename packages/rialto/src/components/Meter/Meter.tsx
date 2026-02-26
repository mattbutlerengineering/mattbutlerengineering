import { forwardRef, type HTMLAttributes } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { precision } from '../../tokens/motion';
import styles from './Meter.module.css';

/**
 * A horizontal gauge bar that visualizes a value within a min/max range.
 * The fill animates to the current fraction using precision easing and respects reduced motion.
 *
 * @example
 * <Meter
 *   label="Fuel Load"
 *   value={72}
 *   max={100}
 *   variant="accent"
 *   showValue
 * />
 */
export interface MeterProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'role'
> {
  /** Current value */
  value: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Accessible label */
  label?: string;
  /** Fill color variant */
  variant?: 'default' | 'accent' | 'success' | 'error';
  /** Show numeric value */
  showValue?: boolean;
  /** Track thickness */
  size?: 'sm' | 'md';
}

export const Meter = forwardRef<HTMLDivElement, MeterProps>(
  (
    {
      value,
      min = 0,
      max = 100,
      label,
      variant = 'default',
      showValue = false,
      size = 'md',
      className,
      ...props
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const range = max - min;
    const fraction =
      range > 0 ? Math.min(1, Math.max(0, (value - min) / range)) : 0;
    const percent = Math.round(fraction * 100);

    const trackClass = [styles.track, size === 'sm' ? styles.trackSm : '']
      .filter(Boolean)
      .join(' ');

    const fillClass = [styles.fill, styles[variant]].filter(Boolean).join(' ');

    return (
      <div
        ref={ref}
        className={[styles.wrapper, className].filter(Boolean).join(' ')}
        {...props}
      >
        {(label || showValue) && (
          <div className={styles.labelRow}>
            {label && <span className={styles.label}>{label}</span>}
            {showValue && <span className={styles.value}>{percent}%</span>}
          </div>
        )}
        <div
          className={trackClass}
          role="meter"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-label={label}
        >
          <motion.div
            className={fillClass}
            initial={shouldReduceMotion ? { scaleX: fraction } : { scaleX: 0 }}
            animate={{ scaleX: fraction }}
            transition={precision}
          />
        </div>
      </div>
    );
  }
);

Meter.displayName = 'Meter';
