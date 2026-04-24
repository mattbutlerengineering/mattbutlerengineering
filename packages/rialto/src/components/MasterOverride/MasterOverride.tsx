import { forwardRef, useState, useId, useRef, useEffect, useCallback, type ReactNode } from "react";
import { motion, useReducedMotion, useMotionValue, animate } from "framer-motion";
// NOTE: useMotionValueEvent will be added in Task 8 (progress ring events)
import { spring, springGentle, reduced } from "../../tokens/motion";
import styles from "./MasterOverride.module.css";

/**
 * A safety-cover toggle: a hinged protective cover flips up to reveal a
 * two-position switch beneath. Designed for destructive or irreversible actions
 * that warrant a deliberate, tactile commitment — the digital equivalent of a
 * missile-silo arming switch.
 *
 * Interaction model:
 * 1. Default state — cover closed, switch underneath is not reachable.
 * 2. Click or Enter on cover → cover lifts; focus moves to the switch.
 * 3. Click or Space on switch → lever flips between positions.
 * 4. Click on cover while open → cover closes (switch state is preserved).
 *
 * @example
 * <MasterOverride
 *   label="System Kill Switch"
 *   on={armed}
 *   onChange={setArmed}
 *   description="Immediately halts all production workloads."
 *   variant="danger"
 * />
 */
export interface MasterOverrideProps {
  /** Current switch position — true = engaged */
  on: boolean;
  onChange: (on: boolean) => void;
  /** Accessible name for the switch (also shown above the bezel) */
  label: string;
  /** Optional supporting context shown beneath the bezel */
  description?: ReactNode;
  /** Text rendered on the switch face when off (default: "STANDBY") */
  idleLabel?: string;
  /** Text rendered on the switch face when on (default: "ENGAGED") */
  activeLabel?: string;
  /** Text on the safety cover — identifies its purpose (default: "LIFT TO ARM") */
  coverLabel?: string;
  size?: "sm" | "md" | "lg";
  /** Visual severity — colors the warning stripe (default: "warning") */
  variant?: "default" | "warning" | "danger";
  disabled?: boolean;
  className?: string;
  /**
   * Require the user to hold the switch for N milliseconds before it engages.
   * Only gates the off → on transition — disengaging remains a single click.
   * Pass `true` for the default 1000ms, or a number to customize.
   * Threshold is clamped to [250, 5000] ms.
   * @default false
   */
  requireHold?: boolean | number;

  /**
   * How the state label (idleLabel / activeLabel) transitions between states.
   * `"splitflap"` replaces the crossfaded labels with a single SplitFlap cell
   * above the switch track that cascades between idle and active values.
   * @default "fade"
   */
  labelTransition?: "fade" | "splitflap";

  /**
   * When `labelTransition="splitflap"`, the fixed cell count for the display.
   * Defaults to `max(idleLabel.length, activeLabel.length)`. Ignored for "fade".
   */
  labelLength?: number;
}

export const MasterOverride = forwardRef<HTMLDivElement, MasterOverrideProps>(
  (
    {
      on,
      onChange,
      label,
      description,
      idleLabel = "STANDBY",
      activeLabel = "ENGAGED",
      coverLabel = "LIFT TO ARM",
      size = "md",
      variant = "warning",
      disabled = false,
      requireHold = false,
      labelTransition: _labelTransition = "fade",
      labelLength: _labelLength,
      className,
    },
    ref
  ) => {
    const [armed, setArmed] = useState(false);
    const switchRef = useRef<HTMLButtonElement>(null);
    const coverRef = useRef<HTMLButtonElement>(null);
    const shouldReduceMotion = useReducedMotion();

    const holdThresholdMs =
      requireHold === true ? 1000
      : typeof requireHold === "number" ? Math.max(250, Math.min(5000, requireHold))
      : 0;
    const holdProgress = useMotionValue(0);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
    const [_isHolding, setIsHolding] = useState(false);

    const startHold = useCallback(() => {
      if (!armed || disabled || on || holdThresholdMs === 0) return;
      if (holdTimerRef.current) return; // already holding — ignore repeats
      setIsHolding(true);
      holdAnimationRef.current = animate(holdProgress, 1, {
        duration: shouldReduceMotion ? 0 : holdThresholdMs / 1000,
        ease: "linear",
      });
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdAnimationRef.current?.stop();
        holdAnimationRef.current = null;
        setIsHolding(false);
        holdProgress.set(0);
        onChange(true);
      }, holdThresholdMs);
    }, [armed, disabled, on, holdThresholdMs, shouldReduceMotion, holdProgress, onChange]);

    const labelId = useId();
    const descriptionId = useId();
    const switchId = useId();

    // Move focus cover↔switch whenever armed changes, but not on mount.
    const isInitialRef = useRef(true);
    useEffect(() => {
      if (isInitialRef.current) {
        isInitialRef.current = false;
        return;
      }
      if (armed) switchRef.current?.focus();
      else coverRef.current?.focus();
    }, [armed]);

    function handleCoverToggle() {
      if (disabled) return;
      setArmed((prev) => !prev);
    }

    function handleSwitchToggle() {
      if (disabled || !armed) return;
      onChange(!on);
    }

    const wrapperClasses = [
      styles.wrapper,
      styles[size],
      styles[`variant-${variant}`],
      on && styles.engaged,
      armed && styles.armed,
      disabled && styles.disabled,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    // Screen-reader announcement string rebuilds on every state change so
    // the live region fires when either cover or switch transitions.
    const statusMessage = !armed
      ? `${label} safety cover closed. Switch is ${on ? activeLabel : idleLabel}.`
      : `${label} safety cover open. Switch is ${on ? activeLabel : idleLabel}.`;

    return (
      <div ref={ref} className={wrapperClasses} aria-disabled={disabled || undefined}>
        <span id={labelId} className={styles.header}>
          {label}
        </span>

        <div className={styles.bezel} aria-labelledby={labelId}>
          {/* Cover — hinged at top, rotates up on X axis */}
          <motion.button
            ref={coverRef}
            type="button"
            className={styles.cover}
            aria-expanded={armed}
            aria-controls={switchId}
            aria-label={armed ? `Close safety cover for ${label}` : `Lift safety cover for ${label}`}
            disabled={disabled}
            onClick={handleCoverToggle}
            animate={{
              rotateX: armed ? -125 : 0,
            }}
            transition={shouldReduceMotion ? reduced : springGentle}
            style={{
              transformOrigin: "top center",
              transformStyle: "preserve-3d",
            }}
          >
            <span className={styles.coverStripes} aria-hidden="true" />
            <span className={styles.coverText}>{coverLabel}</span>
          </motion.button>

          {/* Switch body — only interactive while cover is open.
              Labels sit on the housing (above/below the track), not on the rail. */}
          <button
            ref={switchRef}
            id={switchId}
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={labelId}
            aria-describedby={description ? descriptionId : undefined}
            className={styles.switchBody}
            disabled={disabled || !armed}
            onClick={handleSwitchToggle}
            onPointerDown={holdThresholdMs && !on ? startHold : undefined}
          >
            <span className={styles.labelOn} data-active={on} aria-hidden="true">
              {activeLabel}
            </span>
            <span className={styles.switchTrack} aria-hidden="true">
              <motion.span
                className={styles.switchLever}
                animate={{ y: on ? "-75%" : "75%" }}
                transition={shouldReduceMotion ? reduced : spring}
              />
            </span>
            <span className={styles.labelOff} data-active={!on} aria-hidden="true">
              {idleLabel}
            </span>
          </button>
        </div>

        {description && (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        )}

        <span role="status" aria-live="polite" className={styles.srOnly}>
          {statusMessage}
        </span>
      </div>
    );
  }
);

MasterOverride.displayName = "MasterOverride";
