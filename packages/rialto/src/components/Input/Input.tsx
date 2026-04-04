import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
import styles from "./Input.module.css";

/**
 * Single-line text field with optional label, hint text, and error state.
 * Wraps a native `<input>` — all standard input attributes are supported.
 *
 * @example
 * <Input label="Email" placeholder="you@example.com" />
 * <Input label="Name" hint="As it appears on your ID" />
 * <Input label="Code" error hint="Invalid code" />
 * <Input label="Search" startIcon={<Search size={16} />} placeholder="Search..." />
 */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  /** Helper text rendered below the input */
  hint?: string;
  /** When true, applies error styling and sets `aria-invalid` */
  error?: boolean;
  /** Explains why the input is disabled. Shown in a tooltip; requires `disabled` to be true. */
  disabledReason?: string;
  /** Icon rendered at the inline-start of the input */
  startIcon?: ReactNode;
  /** Icon rendered at the inline-end of the input */
  endIcon?: ReactNode;
  /** When true and not required, shows "(optional)" after the label */
  showOptional?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      disabled,
      disabledReason,
      startIcon,
      endIcon,
      showOptional,
      className,
      id,
      readOnly,
      required,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const wrapperClass = [styles.wrapper, error && styles.error, className]
      .filter(Boolean)
      .join(" ");
    const inputClass = [
      styles.input,
      startIcon && styles.inputWithStartIcon,
      endIcon && styles.inputWithEndIcon,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div className={wrapperClass}>
          {label && (
            <label htmlFor={inputId} className={styles.label}>
              {label}
              {required && <span className={styles.required}> *</span>}
              {showOptional && !required && <span className={styles.optional}> (optional)</span>}
            </label>
          )}
          <div className={styles.inputContainer}>
            {startIcon && (
              <span className={styles.startIcon} aria-hidden>
                {startIcon}
              </span>
            )}
            <input
              ref={ref}
              id={inputId}
              className={inputClass}
              disabled={disabled || undefined}
              aria-invalid={error || undefined}
              aria-describedby={hint ? `${inputId}-hint` : undefined}
              required={required}
              readOnly={readOnly}
              {...props}
            />
            {endIcon && (
              <span className={styles.endIcon} aria-hidden>
                {endIcon}
              </span>
            )}
            {disabled && disabledReason && (
              <Lock size={12} aria-hidden className={styles.lockIcon} />
            )}
          </div>
          {hint && (
            <span id={`${inputId}-hint`} className={styles.hint}>
              {hint}
            </span>
          )}
        </div>
      </DisabledTooltip>
    );
  }
);

Input.displayName = "Input";
