import { forwardRef, useId, useRef, useCallback, useEffect, type InputHTMLAttributes } from "react";
import { Lock } from "lucide-react";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
import styles from "./NumberInput.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * Numeric input with increment/decrement stepper buttons and hold-to-repeat.
 * Always controlled — requires `value` and `onChange`. Values are clamped to `min`/`max` when provided.
 *
 * @example
 * <NumberInput label="Quantity" value={qty} onChange={setQty} min={0} max={99} />
 * <NumberInput label="Price" value={price} onChange={setPrice} step={0.5} />
 * <NumberInput label="Count" value={count} onChange={setCount} size="small" />
 */
export interface NumberInputProps extends Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "name" | "required" | "readOnly"
> {
  value: number;
  /** Called with the clamped numeric value on every change */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Increment/decrement amount per step (default 1) */
  step?: number;
  label?: string;
  hint?: string;
  error?: boolean;
  disabled?: boolean;
  /** Explains why the input is disabled. Shown in a tooltip; requires `disabled` to be true. */
  disabledReason?: string;
  /** When true and not required, shows "(optional)" after the label */
  showOptional?: boolean;
  size?: "small" | "default" | "large";
  className?: string;
}

/* ── Hold-to-repeat constants ────────────────── */
const INITIAL_DELAY = 400;
const REPEAT_INTERVAL = 80;

/* ── Component ──────────────────────────────── */
export const NumberInput = forwardRef<HTMLDivElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      step = 1,
      label,
      hint,
      error = false,
      disabled = false,
      disabledReason,
      showOptional,
      size = "default",
      className = "",
      ...rest
    },
    ref
  ) => {
    const id = useId();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clamp = useCallback(
      (v: number) => {
        let clamped = v;
        if (min != null) clamped = Math.max(min, clamped);
        if (max != null) clamped = Math.min(max, clamped);
        return clamped;
      },
      [min, max]
    );

    const increment = useCallback(() => {
      onChange(clamp(value + step));
    }, [onChange, clamp, value, step]);

    const decrement = useCallback(() => {
      onChange(clamp(value - step));
    }, [onChange, clamp, value, step]);

    /* ── Hold-to-repeat ──────────────────────── */
    const stopRepeat = useCallback(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      timerRef.current = null;
      intervalRef.current = null;
    }, []);

    const startRepeat = useCallback((action: () => void) => {
      action();
      timerRef.current = setTimeout(() => {
        intervalRef.current = setInterval(action, REPEAT_INTERVAL);
      }, INITIAL_DELAY);
    }, []);

    useEffect(() => stopRepeat, [stopRepeat]);

    /* ── Direct input ────────────────────────── */
    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === "" || raw === "-") return;
        const parsed = parseFloat(raw);
        if (!Number.isNaN(parsed)) onChange(clamp(parsed));
      },
      [onChange, clamp]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          increment();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          decrement();
        }
      },
      [increment, decrement]
    );

    const atMin = min != null && value <= min;
    const atMax = max != null && value >= max;

    const wrapperClasses = [
      styles.wrapper,
      size !== "default" ? styles[size] : "",
      error ? styles.error : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div ref={ref} className={wrapperClasses} aria-disabled={disabled || undefined}>
          {label && (
            <label htmlFor={id} className={styles.label}>
              {label}
              {rest.required && <span className={styles.required}> *</span>}
              {showOptional && !rest.required && (
                <span className={styles.optional}> (optional)</span>
              )}
              {disabled && disabledReason && (
                <Lock size={12} aria-hidden className={styles.lockIcon} />
              )}
            </label>
          )}
          <div className={styles.control}>
            <button
              type="button"
              className={`${styles.stepper} ${styles.decrement}`}
              disabled={disabled || atMin}
              tabIndex={-1}
              aria-label="Decrease"
              onPointerDown={() => startRepeat(decrement)}
              onPointerUp={stopRepeat}
              onPointerLeave={stopRepeat}
            >
              <svg className={styles.stepperIcon} viewBox="0 0 14 14">
                <line x1="3" y1="7" x2="11" y2="7" />
              </svg>
            </button>
            <input
              id={id}
              type="number"
              className={styles.input}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              min={min}
              max={max}
              step={step}
              aria-disabled={disabled || undefined}
              aria-describedby={hint ? `${id}-hint` : undefined}
              readOnly={disabled || rest.readOnly}
              {...rest}
            />
            <button
              type="button"
              className={`${styles.stepper} ${styles.increment}`}
              disabled={disabled || atMax}
              tabIndex={-1}
              aria-label="Increase"
              onPointerDown={() => startRepeat(increment)}
              onPointerUp={stopRepeat}
              onPointerLeave={stopRepeat}
            >
              <svg className={styles.stepperIcon} viewBox="0 0 14 14">
                <line x1="3" y1="7" x2="11" y2="7" />
                <line x1="7" y1="3" x2="7" y2="11" />
              </svg>
            </button>
          </div>
          {hint && <span id={`${id}-hint`} className={styles.hint}>{hint}</span>}
        </div>
      </DisabledTooltip>
    );
  }
);
NumberInput.displayName = "NumberInput";
