import {
  forwardRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { precision } from '../../tokens/motion';
import styles from './Banner.module.css';

/**
 * Props for the Banner component, a full-width page-level message displayed at the top
 * of a view to communicate system status, feature announcements, or critical warnings.
 *
 * Unlike Alert (inline), Banner spans the full content width and is intended for one-per-page messaging.
 *
 * @example
 * <Banner variant="warning" dismissible action={<Button size="sm">Update</Button>}>
 *   A new version is available. Please update to continue.
 * </Banner>
 */
export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual and semantic variant */
  variant?: 'info' | 'warning' | 'error' | 'accent';
  /** Allow the user to dismiss */
  dismissible?: boolean;
  /** Callback when dismissed */
  onDismiss?: () => void;
  /** Optional action slot (e.g. a Button) */
  action?: ReactNode;
  children: ReactNode;
}

const variantIcons: Record<string, ReactNode> = {
  info: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7v4" />
      <circle cx="8" cy="5.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  warning: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2L1.5 13h13L8 2z" />
      <path d="M8 6.5v3" />
      <circle cx="8" cy="11" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  error: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
    </svg>
  ),
  accent: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.5l2 4.5 5 .5-3.5 3.5 1 5L8 12.5 3.5 15l1-5L1 6.5l5-.5 2-4.5z" />
    </svg>
  ),
};

export const Banner = forwardRef<HTMLDivElement, BannerProps>(
  (
    {
      variant = 'info',
      dismissible = false,
      onDismiss,
      action,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const [visible, setVisible] = useState(true);
    const shouldReduceMotion = useReducedMotion();

    const handleDismiss = () => {
      setVisible(false);
      onDismiss?.();
    };

    const role =
      variant === 'error' || variant === 'warning' ? 'alert' : 'status';

    return (
      <AnimatePresence>
        {visible && (
          <motion.div
            ref={ref}
            className={[styles.banner, styles[variant], className]
              .filter(Boolean)
              .join(' ')}
            role={role}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={
              shouldReduceMotion
                ? undefined
                : { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }
            }
            transition={precision}
            {...(props as React.ComponentProps<typeof motion.div>)}
          >
            <span className={styles.icon}>{variantIcons[variant]}</span>
            <span className={styles.body}>{children}</span>
            {action && <span className={styles.action}>{action}</span>}
            {dismissible && (
              <button
                className={styles.close}
                onClick={handleDismiss}
                aria-label="Dismiss"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M1 1l10 10M11 1L1 11" />
                </svg>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

Banner.displayName = 'Banner';
