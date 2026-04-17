import { forwardRef, useState, useId, useRef, useEffect, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
      className,
    },
    ref
  ) => {
    const [armed, setArmed] = useState(false);
    const switchRef = useRef<HTMLButtonElement>(null);
    const coverRef = useRef<HTMLButtonElement>(null);
    const shouldReduceMotion = useReducedMotion();

    const labelId = useId();
    const descriptionId = useId();
    const switchId = useId();

    // When cover lifts via user interaction, move focus to the switch
    // so the deliberate next gesture is keyboard-reachable without Tab.
    const lastArmedTrigger = useRef<"user" | "initial">("initial");
    useEffect(() => {
      if (armed && lastArmedTrigger.current === "user") {
        switchRef.current?.focus();
      } else if (!armed && lastArmedTrigger.current === "user") {
        coverRef.current?.focus();
      }
    }, [armed]);

    function handleCoverToggle() {
      if (disabled) return;
      lastArmedTrigger.current = "user";
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

          {/* Switch body — only interactive while cover is open */}
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
          >
            <span className={styles.switchTrack} aria-hidden="true">
              <motion.span
                className={styles.switchLever}
                animate={{ y: on ? "-42%" : "42%" }}
                transition={shouldReduceMotion ? reduced : spring}
              />
              <span className={styles.switchLabels} aria-hidden="true">
                <span className={styles.labelOn} data-active={on}>
                  {activeLabel}
                </span>
                <span className={styles.labelOff} data-active={!on}>
                  {idleLabel}
                </span>
              </span>
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
