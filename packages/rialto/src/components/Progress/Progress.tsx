import { forwardRef, type HTMLAttributes } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { precision } from "../../tokens/motion";
import styles from "./Progress.module.css";

/* ── Progress Bar ────────────────────────────── */
/**
 * Props for the Progress bar component, used to visualize task completion or loading state.
 *
 * Omit `value` to render an indeterminate (looping) animation; provide a number 0-100 for determinate progress.
 *
 * @example
 * <Progress value={65} label="Uploading" showValue size="md" />
 * <Progress label="Processing..." />
 */
export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100. Omit for indeterminate. */
  value?: number;
  label?: string;
  /** Show percentage value */
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ value, label, showValue, size = "md", className, "aria-label": ariaLabel, ...props }, ref) => {
    const shouldReduceMotion = useReducedMotion();
    const determinate = value !== undefined;
    const clamped = determinate ? Math.min(100, Math.max(0, value)) : 0;

    const trackClass = [
      styles.track,
      size === "sm" ? styles.trackSm : size === "lg" ? styles.trackLg : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={[styles.wrapper, className].filter(Boolean).join(" ")} {...props}>
        {(label || showValue) && (
          <div className={styles.labelRow}>
            {label && <span className={styles.label}>{label}</span>}
            {showValue && determinate && (
              <span className={styles.value}>{Math.round(clamped)}%</span>
            )}
          </div>
        )}
        <div
          className={trackClass}
          role="progressbar"
          aria-valuenow={determinate ? clamped : undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ariaLabel ?? label}
        >
          {determinate ? (
            <motion.div
              className={styles.fill}
              initial={shouldReduceMotion ? { scaleX: clamped / 100 } : { scaleX: 0 }}
              animate={{ scaleX: clamped / 100 }}
              transition={precision}
            />
          ) : (
            <div className={styles.indeterminate} />
          )}
        </div>
      </div>
    );
  }
);

Progress.displayName = "Progress";

/* ── Light Trace Spinner ──────────────────────── */
/*   A single gold point of light tracing along    */
/*   a machined aluminum ring — like sunlight      */
/*   catching the beveled edge of brushed metal.   */
/**
 * Props for the Spinner component, a circular loading indicator styled as a gold light
 * tracing along a machined aluminum ring.
 *
 * Uses a CSS-only animation so it works even when JavaScript is blocked or React is hydrating.
 *
 * @example
 * <Spinner size="md" label="Loading results" />
 * <Spinner size="sm" />
 */
export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  ({ size = "md", label = "Loading", className, ...props }, ref) => {
    const sizeClass =
      size === "sm" ? styles.traceSm : size === "lg" ? styles.traceLg : styles.traceMd;

    return (
      <div
        ref={ref}
        className={[styles.trace, sizeClass, className].filter(Boolean).join(" ")}
        role="status"
        aria-label={label}
        {...props}
      >
        <svg className={styles.traceSvg} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="rialto-trace-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--rialto-accent)" stopOpacity="0" />
              <stop offset="50%" stopColor="var(--rialto-accent-hover)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--rialto-accent)" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          {/* Aluminum ring — the machined channel */}
          <circle className={styles.traceRing} cx="50" cy="50" r="46" />
          {/* Glow — soft gold halo behind the light point */}
          <circle className={styles.traceGlow} cx="50" cy="50" r="46" pathLength="100" />
          {/* Light point — the sharp gold trace */}
          <circle className={styles.tracePath} cx="50" cy="50" r="46" pathLength="100" />
        </svg>
      </div>
    );
  }
);

Spinner.displayName = "Spinner";
