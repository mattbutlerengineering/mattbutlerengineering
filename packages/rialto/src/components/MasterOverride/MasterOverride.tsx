import { forwardRef, useState, useId, useRef, useEffect, useCallback, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { motion, useReducedMotion, useMotionValue, useMotionValueEvent, animate } from "framer-motion";
import { spring, springGentle, reduced } from "../../tokens/motion";
import styles from "./MasterOverride.module.css";
import { SplitFlap } from "../SplitFlap";

/**
 * A safety-cover toggle: a hinged protective cover flips up to reveal a
 * two-position switch beneath. Designed for destructive or irreversible actions
 * that warrant a deliberate, tactile commitment — the digital equivalent of a
 * missile-silo arming switch.
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
   * Threshold is clamped to [250, 5000] ms.
   * @default false
   */
  requireHold?: boolean | number;

  /**
   * How the state label (idleLabel / activeLabel) transitions between states.
   * @default "fade"
   */
  labelTransition?: "fade" | "splitflap";

  /**
   * When `labelTransition="splitflap"`, the fixed cell count for the display.
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
      labelTransition = "fade",
      labelLength,
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
    const useSplitFlap = labelTransition === "splitflap";
    const resolvedLabelLength =
      labelLength ?? Math.max(idleLabel.length, activeLabel.length);
    const splitFlapSize: "sm" | "md" = size === "lg" ? "md" : "sm";
    const holdProgress = useMotionValue(0);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const [isHolding, setIsHolding] = useState(false);
    const [holdAnnouncement, setHoldAnnouncement] = useState<{
      text: string;
      armed: boolean;
      on: boolean;
    } | null>(null);

    const startHold = useCallback(() => {
      if (!armed || disabled || on || holdThresholdMs === 0) return;
      if (holdTimerRef.current) return;
      setIsHolding(true);
      setHoldAnnouncement({ text: `Hold to arm ${label}`, armed: true, on: false });
      holdAnimationRef.current = animate(holdProgress, 1, {
        duration: shouldReduceMotion ? 0 : holdThresholdMs / 1000,
        ease: "linear",
      });
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdAnimationRef.current?.stop();
        holdAnimationRef.current = null;
        setIsHolding(false);
        setHoldAnnouncement({ text: `${label} engaged`, armed: true, on: false });
        holdProgress.set(0);
        onChange(true);
      }, holdThresholdMs);
    }, [armed, disabled, on, holdThresholdMs, shouldReduceMotion, holdProgress, onChange, label]);

    const cancelHold = useCallback(() => {
      if (holdTimerRef.current === null && !isHolding) return;
      const wasActive = holdTimerRef.current !== null;
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      holdAnimationRef.current?.stop();
      holdAnimationRef.current = null;
      setIsHolding(false);
      if (wasActive) setHoldAnnouncement({ text: "Arming cancelled", armed: true, on: false });
      animate(holdProgress, 0, { duration: shouldReduceMotion ? 0 : 0.2 });
    }, [isHolding, shouldReduceMotion, holdProgress]);

    useMotionValueEvent(holdProgress, "change", (v) => {
      wrapperRef.current?.style.setProperty("--mo-hold-progress", String(v));
    });

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        wrapperRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    useEffect(() => {
      return () => {
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        holdAnimationRef.current?.stop();
      };
    }, []);

    useEffect(() => {
      if (!isHolding) return;
      const handler = () => cancelHold();
      document.addEventListener("pointerup", handler);
      return () => document.removeEventListener("pointerup", handler);
    }, [isHolding, cancelHold]);

    const handleKeyDown = useCallback(
      (e: ReactKeyboardEvent) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          startHold();
        }
      },
      [startHold]
    );

    const handleKeyUp = useCallback(
      (e: ReactKeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") cancelHold();
      },
      [cancelHold]
    );

    const labelId = useId();
    const descriptionId = useId();
    const switchId = useId();

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
      if (holdThresholdMs > 0 && !on) return;
      onChange(!on);
    }

    const wrapperClasses = [
      styles.wrapper,
      styles[size],
      styles[`variant-${variant}`],
      on && styles.engaged,
      armed && styles.armed,
      isHolding && styles.holding,
      disabled && styles.disabled,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const statusMessage = !armed
      ? `${label} safety cover closed. Switch is ${on ? activeLabel : idleLabel}.`
      : `${label} safety cover open. Switch is ${on ? activeLabel : idleLabel}.`;

    const liveRegionText =
      holdAnnouncement !== null &&
      holdAnnouncement.armed === armed &&
      holdAnnouncement.on === on
        ? holdAnnouncement.text
        : statusMessage;

    return (
      <div ref={setRefs} className={wrapperClasses} aria-disabled={disabled || undefined}>
        <span id={labelId} className={styles.header}>
          {label}
        </span>

        <div className={styles.bezel} aria-labelledby={labelId}>
          {/* LED Telltale */}
          <div 
            className={styles.led} 
            data-status={on ? "engaged" : armed ? "armed" : "idle"} 
            aria-hidden="true" 
          />

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

          {/* Switch body */}
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
            onPointerDown={holdThresholdMs > 0 && !on ? startHold : undefined}
            onPointerUp={holdThresholdMs > 0 ? cancelHold : undefined}
            onPointerLeave={holdThresholdMs > 0 ? cancelHold : undefined}
            onKeyDown={holdThresholdMs > 0 && !on ? handleKeyDown : undefined}
            onKeyUp={holdThresholdMs > 0 ? handleKeyUp : undefined}
          >
            {useSplitFlap ? (
              <>
                <span className={styles.splitFlapLabel} aria-hidden="true">
                  <SplitFlap
                    value={on ? activeLabel : idleLabel}
                    length={resolvedLabelLength}
                    size={splitFlapSize}
                    charset="alphanumeric"
                    aria-label=" "
                  />
                </span>
                <span className={styles.switchTrack} aria-hidden="true">
                  <span className={styles.progressRing} />
                  <motion.span
                    className={styles.switchLever}
                    animate={{ y: on ? "-75%" : "75%" }}
                    transition={shouldReduceMotion ? reduced : spring}
                  />
                </span>
              </>
            ) : (
              <>
                <span className={styles.labelOn} data-active={on} aria-hidden="true">
                  {activeLabel}
                </span>
                <span className={styles.switchTrack} aria-hidden="true">
                  <span className={styles.progressRing} />
                  <motion.span
                    className={styles.switchLever}
                    animate={{ y: on ? "-75%" : "75%" }}
                    transition={shouldReduceMotion ? reduced : spring}
                  />
                </span>
                <span className={styles.labelOff} data-active={!on} aria-hidden="true">
                  {idleLabel}
                </span>
              </>
            )}
          </button>
        </div>

        {description && (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        )}

        <span role="status" aria-live="polite" className={styles.srOnly}>
          {liveRegionText}
        </span>
      </div>
    );
  }
);

MasterOverride.displayName = "MasterOverride";
