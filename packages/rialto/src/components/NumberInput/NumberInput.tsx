import {
  forwardRef,
  useRef,
  useCallback,
  useEffect,
  useState,
  type InputHTMLAttributes,
} from "react";
import { Lock } from "lucide-react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { cn, variantClass } from "../../utils/class-composer";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
import { useField } from "../../hooks/useField";
import styles from "./NumberInput.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * Numeric input with increment/decrement stepper buttons and hold-to-repeat.
 * Always controlled — requires `value` and `onChange`. Stepper buttons and arrow keys
 * clamp on each press. Typed text stays as entered and is clamped to `min`/`max`
 * when the field commits (blur).
 *
 * @example
 * <NumberInput label="Quantity" value={qty} onChange={setQty} min={0} max={99} />
 * <NumberInput label="Price" value={price} onChange={setPrice} step={0.5} />
 * <NumberInput label="Count" value={count} onChange={setCount} size="small" />
 */
export interface NumberInputProps extends Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "name" | "required" | "readOnly"
> {
  value: number;
  /**
   * Called with the clamped numeric value when the field commits, or when a
   * stepper or arrow key changes it. Not called for each keystroke.
   */
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

/**
 * Number in an in-progress field, or null while it is empty or only a sign
 * or decimal point — the next keystroke can still complete those.
 */
function parseTypedNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (
    trimmed === "" ||
    trimmed === "-" ||
    trimmed === "+" ||
    trimmed === "." ||
    trimmed === "-." ||
    trimmed === "+."
  ) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

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
      showOptional: showOptionalProp,
      size = "default",
      className = "",
      required,
      id,
      ...rest
    },
    ref
  ) => {
    const { messages } = useRialtoLocale();
    const field = useField({ id, hint, error, required, showOptional: showOptionalProp });
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    /** In-progress text. Null once the field is showing the committed `value`. */
    const [draft, setDraft] = useState<string | null>(null);
    // Mirrors `draft` so a stepper press and the blur it causes can't both commit.
    const draftRef = useRef<string | null>(null);
    const setDraftText = useCallback((next: string | null) => {
      draftRef.current = next;
      setDraft(next);
    }, []);

    const clamp = useCallback(
      (v: number) => {
        let clamped = v;
        if (min != null) clamped = Math.max(min, clamped);
        if (max != null) clamped = Math.min(max, clamped);
        return clamped;
      },
      [min, max]
    );

    /** Committed value a step should start from, dropping any in-progress text. */
    const baseForStep = useCallback((): number => {
      const raw = draftRef.current;
      if (raw === null) return value;
      setDraftText(null);
      const parsed = parseTypedNumber(raw);
      return parsed === null ? value : clamp(parsed);
    }, [value, clamp, setDraftText]);

    const increment = useCallback(() => {
      onChange(clamp(baseForStep() + step));
    }, [onChange, clamp, baseForStep, step]);

    const decrement = useCallback(() => {
      onChange(clamp(baseForStep() - step));
    }, [onChange, clamp, baseForStep, step]);

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

    /* ── Direct input — clamp when the field commits, not per keystroke ── */
    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        // type="text" so a leading "-" or "0" survives until blur. A number input
        // sanitizes both, which is what made "-5" and "07" clamp a digit at a time.
        const raw = e.target.value;
        if (raw !== "" && !/^[+-]?\d*\.?\d*$/.test(raw)) return;
        setDraftText(raw);
      },
      [setDraftText]
    );

    const handleBlur = useCallback(() => {
      const raw = draftRef.current;
      if (raw === null) return;
      setDraftText(null);
      const parsed = parseTypedNumber(raw);
      if (parsed === null) return;
      const next = clamp(parsed);
      if (next !== value) onChange(next);
    }, [clamp, value, onChange, setDraftText]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (rest.readOnly) return;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          increment();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          decrement();
        }
      },
      [increment, decrement, rest.readOnly]
    );

    const parsedDraft = draft === null ? null : parseTypedNumber(draft);
    const live = parsedDraft === null ? value : clamp(parsedDraft);
    const atMin = min != null && live <= min;
    const atMax = max != null && live >= max;
    const shown =
      draft ?? (typeof value === "number" && Number.isFinite(value) ? String(value) : "");

    const wrapperClasses = cn(
      styles.wrapper,
      variantClass(styles, size, "default"),
      error && styles.error,
      className
    );

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div ref={ref} className={wrapperClasses}>
          {label && (
            <label {...field.labelProps} className={styles.label}>
              {label}
              {field.requiredMarker}
              {field.showOptional && <span className={styles.optional}> {messages.optional}</span>}
              {disabled && disabledReason && (
                <Lock size={12} aria-hidden className={styles.lockIcon} />
              )}
            </label>
          )}
          <div className={styles.control}>
            <button
              type="button"
              className={cn(styles.stepper, styles.decrement)}
              disabled={disabled || rest.readOnly || atMin}
              tabIndex={-1}
              aria-label={messages.decrease}
              onPointerDown={() => startRepeat(decrement)}
              onPointerUp={stopRepeat}
              onPointerLeave={stopRepeat}
            >
              <svg className={styles.stepperIcon} viewBox="0 0 14 14">
                <line x1="3" y1="7" x2="11" y2="7" />
              </svg>
            </button>
            <input
              {...field.controlProps}
              type="text"
              inputMode="decimal"
              className={styles.input}
              value={shown}
              onChange={handleInputChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              readOnly={rest.readOnly}
              {...rest}
            />
            <button
              type="button"
              className={cn(styles.stepper, styles.increment)}
              disabled={disabled || rest.readOnly || atMax}
              tabIndex={-1}
              aria-label={messages.increase}
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
          {hint &&
            (error ? (
              <span key="error" {...field.errorProps} className={styles.hint}>
                {hint}
              </span>
            ) : (
              <span key="hint" {...field.descriptionProps} className={styles.hint}>
                {hint}
              </span>
            ))}
        </div>
      </DisabledTooltip>
    );
  }
);
NumberInput.displayName = "NumberInput";
