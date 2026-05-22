import { forwardRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { precision } from "../../tokens/motion";
import styles from "./Alert.module.css";

/* ── Types ───────────────────────────────────── */
type AlertVariant = "info" | "success" | "warning" | "error";

/**
 * Props for the Alert component, an inline feedback message used to communicate
 * contextual information, success confirmations, warnings, or errors within a page flow.
 *
 * Dismissible alerts animate out and call `onDismiss` after the exit transition completes.
 *
 * @example
 * <Alert variant="warning" title="Unsaved changes" dismissible>
 *   You have edits that haven't been saved yet.
 *   <Button size="sm">Save now</Button>
 * </Alert>
 */
export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  /** Show dismiss button */
  dismissible?: boolean;
  /** Called when dismissed */
  onDismiss?: () => void;
  /** Action slot rendered below the description */
  actions?: ReactNode;
  className?: string;
}

/* ── Icons per variant ──────────────────────── */
const icons: Record<AlertVariant, ReactNode> = {
  info: (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="7.5" />
      <path d="M9 8v4" />
      <circle cx="9" cy="5.75" r="0.25" fill="currentColor" stroke="none" />
    </svg>
  ),
  success: (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="7.5" />
      <path d="M6 9.5l2 2 4-4.5" />
    </svg>
  ),
  warning: (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 2L1.5 15.5h15z" />
      <path d="M9 7v3.5" />
      <circle cx="9" cy="13" r="0.25" fill="currentColor" stroke="none" />
    </svg>
  ),
  error: (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="7.5" />
      <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" />
    </svg>
  ),
};

/* ── Component ──────────────────────────────── */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  (
    { variant = "info", title, children, dismissible = false, onDismiss, actions, className = "" },
    ref
  ) => {
    const [visible, setVisible] = useState(true);
    const shouldReduceMotion = useReducedMotion();

    function handleDismiss() {
      setVisible(false);
      onDismiss?.();
    }

    const role = variant === "error" || variant === "warning" ? "alert" : "status";

    return (
      <AnimatePresence>
        {visible && (
          <motion.div
            ref={ref}
            className={`${styles.alert} ${styles[variant]} ${className}`}
            role={role}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    height: 0,
                    marginBottom: 0,
                    padding: 0,
                    overflow: "hidden",
                  }
            }
            transition={shouldReduceMotion ? { duration: 0.1 } : precision}
          >
            <div className={styles.icon}>{icons[variant]}</div>

            <div className={styles.body}>
              {title && <p className={styles.title}>{title}</p>}
              <div className={styles.description}>{children}</div>
              {actions && <div className={styles.actions}>{actions}</div>}
            </div>

            {dismissible && (
              <button
                type="button"
                className={styles.close}
                onClick={handleDismiss}
                aria-label="Dismiss"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M1 1l8 8M9 1l-8 8" />
                </svg>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);
Alert.displayName = "Alert";
