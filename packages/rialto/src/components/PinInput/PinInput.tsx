import {
  forwardRef,
  useId,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ClipboardEvent,
  type ChangeEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { spring } from "../../tokens/motion";
import { cn, variantClass } from "../../utils/class-composer";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
import styles from "./PinInput.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * Fixed-length code entry field (PIN, OTP, verification codes).
 * Renders one input cell per character with automatic focus advance, paste support,
 * and a spring pop animation when a character is entered.
 *
 * @example
 * <PinInput label="Verification code" length={6} value={code} onChange={setCode} />
 * <PinInput mask type="numeric" onComplete={handleSubmit} />
 * <PinInput length={4} type="alphanumeric" error hint="Code expired" />
 */
export interface PinInputProps {
  /** Number of input cells (default 4) */
  length?: number;
  /** Obscure entered characters like a password field */
  mask?: boolean;
  /** Accepted character set — `"numeric"` restricts to digits only */
  type?: "numeric" | "alphanumeric";
  size?: "sm" | "md" | "lg";
  label?: string;
  hint?: string;
  error?: boolean;
  disabled?: boolean;
  /** Explains why the pin input is disabled. Shown in a tooltip; requires `disabled` to be true. */
  disabledReason?: string;
  value?: string;
  onChange?: (value: string) => void;
  /** Fires when all cells are filled */
  onComplete?: (value: string) => void;
  className?: string;
}

/* ── Component ──────────────────────────────── */
export const PinInput = forwardRef<HTMLDivElement, PinInputProps>(function PinInput(
  {
    length = 4,
    mask = false,
    type = "numeric",
    size = "md",
    label,
    hint,
    error = false,
    disabled = false,
    disabledReason,
    value = "",
    onChange,
    onComplete,
    className = "",
  },
  ref
) {
  const id = useId();
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);
  const shouldReduceMotion = useReducedMotion();

  const chars = value.padEnd(length, "").slice(0, length).split("");

  const focusCell = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, length - 1));
      cellRefs.current[clamped]?.focus();
    },
    [length]
  );

  const updateValue = useCallback(
    (newChars: string[]) => {
      const next = newChars.join("").slice(0, length);
      onChange?.(next);
      if (next.length === length && !next.includes("")) {
        onComplete?.(next);
      }
    },
    [length, onChange, onComplete]
  );

  const isValidChar = useCallback(
    (ch: string) => {
      if (type === "numeric") return /^[0-9]$/.test(ch);
      return /^[a-zA-Z0-9]$/.test(ch);
    },
    [type]
  );

  /* ── Handlers ────────────────────────────── */
  const handleChange = useCallback(
    (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
      const ch = e.target.value.slice(-1);
      if (!ch || !isValidChar(ch)) return;

      const next = [...chars];
      next[index] = ch;
      updateValue(next);

      if (index < length - 1) {
        focusCell(index + 1);
      }
    },
    [chars, length, isValidChar, updateValue, focusCell]
  );

  const handleKeyDown = useCallback(
    (index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        e.preventDefault();
        const next = [...chars];
        if (chars[index]) {
          next[index] = "";
          updateValue(next);
        } else if (index > 0) {
          next[index - 1] = "";
          updateValue(next);
          focusCell(index - 1);
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        focusCell(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        focusCell(index + 1);
      }
    },
    [chars, updateValue, focusCell]
  );

  const handlePaste = useCallback(
    (index: number) => (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text/plain").trim();
      const next = [...chars];
      let cursor = index;

      for (const ch of pasted) {
        if (cursor >= length) break;
        if (isValidChar(ch)) {
          next[cursor] = ch;
          cursor++;
        }
      }

      updateValue(next);
      focusCell(Math.min(cursor, length - 1));
    },
    [chars, length, isValidChar, updateValue, focusCell]
  );

  /* ── Class names ─────────────────────────── */
  const wrapperClasses = cn(
    styles.wrapper,
    variantClass(styles, size, "md"),
    error && styles.error,
    className
  );

  const entryAnimation = shouldReduceMotion
    ? {}
    : {
        initial: { scale: 0.6, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        transition: spring,
      };

  return (
    <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
      <div ref={ref} className={wrapperClasses} aria-disabled={disabled || undefined}>
        {label && (
          <label id={`${id}-label`} className={styles.label}>
            {label}
            {disabled && disabledReason && (
              <Lock size={12} aria-hidden className={styles.lockIcon} />
            )}
          </label>
        )}

        <div
          className={styles.cells}
          role="group"
          aria-labelledby={label ? `${id}-label` : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
        >
          {chars.map((ch, i) => {
            const filled = ch !== "";
            return (
              <motion.input
                key={i}
                ref={(el) => {
                  cellRefs.current[i] = el;
                }}
                className={styles.cell}
                type={mask ? "password" : "text"}
                inputMode={type === "numeric" ? "numeric" : "text"}
                pattern={type === "numeric" ? "[0-9]" : undefined}
                maxLength={1}
                value={ch}
                disabled={disabled}
                readOnly={disabled}
                autoComplete="one-time-code"
                aria-label={`Digit ${i + 1} of ${length}`}
                onChange={handleChange(i)}
                onKeyDown={handleKeyDown(i)}
                onPaste={handlePaste(i)}
                onFocus={(e) => e.target.select()}
                {...(filled ? entryAnimation : {})}
              />
            );
          })}
        </div>

        {hint && (
          <span id={`${id}-hint`} className={styles.hint}>
            {hint}
          </span>
        )}
      </div>
    </DisabledTooltip>
  );
});

PinInput.displayName = "PinInput";
