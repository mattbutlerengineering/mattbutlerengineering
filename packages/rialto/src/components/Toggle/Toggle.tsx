import { forwardRef, useId, useRef, type InputHTMLAttributes } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { spring, boop } from "../../tokens/motion";
import { useDirection } from "../../hooks/useDirection";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
import styles from "./Toggle.module.css";

/**
 * Binary on/off switch with a spring-animated sliding knob.
 * Renders as a checkbox with `role="switch"` — all standard input attributes are forwarded.
 *
 * @example
 * <Toggle label="Dark mode" checked={dark} onCheckedChange={setDark} />
 * <Toggle label="Notifications" />
 * <Toggle label="Maintenance" disabled />
 */
export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Explains why the toggle is disabled. Shown in a tooltip; requires `disabled` to be true. */
  disabledReason?: string;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, checked, onCheckedChange, disabled, disabledReason, className, ...props }, ref) => {
    const isControlled = checked !== undefined;
    const autoId = useId();
    const id = props.id ?? autoId;
    const shouldReduceMotion = useReducedMotion();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dir = useDirection(wrapperRef);

    const inputProps = isControlled ? { checked, "aria-checked": checked } : {};

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div
          ref={wrapperRef}
          className={[styles.wrapper, className].filter(Boolean).join(" ")}
          aria-disabled={disabled || undefined}
        >
          <input
            ref={ref}
            type="checkbox"
            role="switch"
            id={id}
            className={styles.input}
            disabled={disabled}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            {...inputProps}
            {...props}
          />
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- visual track label, hidden from AT */}
          <label
            htmlFor={id}
            className={styles.track}
            data-checked={checked ?? false}
            aria-hidden="true"
          >
            <motion.div
              className={styles.knob}
              animate={{ x: (checked ?? false) ? (dir === "rtl" ? -20 : 20) : 0 }}
              whileHover={
                disabled || shouldReduceMotion
                  ? undefined
                  : { scale: boop.scale, transition: boop.transition }
              }
              transition={shouldReduceMotion ? { duration: 0 } : spring}
            />
          </label>
          {label && (
            <label htmlFor={id} className={styles.label}>
              {label}
            </label>
          )}
          {disabled && disabledReason && <Lock size={12} aria-hidden className={styles.lockIcon} />}
        </div>
      </DisabledTooltip>
    );
  }
);

Toggle.displayName = "Toggle";
