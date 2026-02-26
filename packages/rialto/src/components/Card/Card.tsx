import {
  forwardRef,
  useCallback,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { useTilt } from '../../hooks/useTilt';
import styles from './Card.module.css';

/**
 * A content container with elevated, glass, or flat surface treatments.
 * Use Card to group related content into a visually distinct panel.
 *
 * @example
 * <Card variant="elevated" title="Session Data">
 *   <p>Lap times and telemetry info</p>
 * </Card>
 *
 * @example
 * <Card tilt title="Interactive Card">
 *   <p>Hover to see 3D tilt effect</p>
 * </Card>
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Surface treatment: `"elevated"` (shadow), `"glass"` (translucent blur), or `"flat"` (no shadow) */
  variant?: 'elevated' | 'glass' | 'flat';
  /** Enable subtle cursor-tracking 3D tilt on hover. Disabled for `glass` variant. */
  tilt?: boolean;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'elevated',
      tilt = false,
      title,
      subtitle,
      className,
      children,
      ...props
    },
    forwardedRef
  ) => {
    const tiltEnabled = tilt && variant !== 'glass';
    const {
      ref: tiltRef,
      style,
      onMouseMove,
      onMouseLeave,
    } = useTilt(tiltEnabled);

    // Merge forwarded ref and tilt callback ref
    const mergedRef = useCallback(
      (el: HTMLDivElement | null) => {
        tiltRef(el);
        if (typeof forwardedRef === 'function') {
          forwardedRef(el);
        } else if (forwardedRef) {
          forwardedRef.current = el;
        }
      },
      [forwardedRef, tiltRef]
    );

    const variantClass =
      variant === 'glass'
        ? styles.glass
        : variant === 'flat'
          ? styles.flat
          : styles.card;

    const classes = [variantClass, className].filter(Boolean).join(' ');

    return (
      <motion.div
        ref={mergedRef}
        className={classes}
        style={style}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        data-tilt={tiltEnabled || undefined}
        {...(props as HTMLMotionProps<'div'>)}
      >
        {(title || subtitle) && (
          <div className={styles.header}>
            {title && <h3 className={styles.title}>{title}</h3>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        )}
        {children}
      </motion.div>
    );
  }
);

Card.displayName = 'Card';
