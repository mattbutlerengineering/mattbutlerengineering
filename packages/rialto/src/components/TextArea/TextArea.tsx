import {
  forwardRef,
  useState,
  useId,
  useRef,
  useCallback,
  type TextareaHTMLAttributes,
} from "react";
import { Lock } from "lucide-react";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
import styles from "./TextArea.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * Multi-line text field with optional label, hint, error state, auto-resize, and character counter.
 * Accepts a subset of native `<textarea>` attributes for controlled or uncontrolled use.
 *
 * @example
 * <TextArea label="Bio" placeholder="Tell us about yourself" />
 * <TextArea label="Notes" autoResize maxLength={200} />
 * <TextArea label="Description" rows={5} error hint="Required" />
 */
export interface TextAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "style" | "className"
> {
  label?: string;
  hint?: string;
  /** When true, applies error styling to the wrapper */
  error?: boolean;
  /** Auto-resize to fit content */
  autoResize?: boolean;
  /** Max character count (shows counter) */
  maxLength?: number;
  /** Explains why the textarea is disabled. Shown in a tooltip; requires `disabled` to be true. */
  disabledReason?: string;
  /** When true and not required, shows "(optional)" after the label */
  showOptional?: boolean;
  className?: string;
}

/* ── Component ──────────────────────────────── */
export const TextArea = forwardRef<HTMLDivElement, TextAreaProps>(
  (
    {
      label,
      hint,
      error = false,
      autoResize = false,
      maxLength,
      disabledReason,
      showOptional,
      className = "",
      rows = 3,
      value,
      onChange,
      disabled,
      readOnly,
      required,
      ...rest
    },
    ref
  ) => {
    const id = useId();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [internalLength, setInternalLength] = useState(0);

    const handleAutoResize = useCallback(() => {
      const el = textareaRef.current;
      if (!el || !autoResize) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, [autoResize]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange?.(e);
        setInternalLength(e.target.value.length);
        handleAutoResize();
      },
      [onChange, handleAutoResize]
    );

    const currentLength = typeof value === "string" ? value.length : internalLength;
    const isOver = maxLength != null && currentLength > maxLength;

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div ref={ref} className={`${styles.wrapper} ${error ? styles.error : ""} ${className}`}>
          {label && (
            <label htmlFor={id} className={styles.label}>
              {label}
              {required && <span className={styles.required}> *</span>}
              {showOptional && !required && <span className={styles.optional}> (optional)</span>}
            </label>
          )}
          <div className={styles.textareaContainer}>
            <textarea
              ref={textareaRef}
              id={id}
              className={`${styles.textarea} ${autoResize ? styles.autoResize : ""}`}
              rows={rows}
              value={value}
              onChange={handleChange}
              disabled={disabled}
              aria-describedby={hint ? `${id}-hint` : undefined}
              readOnly={readOnly}
              {...rest}
            />
            {disabled && disabledReason && (
              <Lock size={12} aria-hidden className={styles.lockIcon} />
            )}
          </div>
          {(hint || maxLength != null) && (
            <div className={styles.footer}>
              {hint && (
                <span id={`${id}-hint`} className={styles.hint}>
                  {hint}
                </span>
              )}
              {maxLength != null && (
                <span className={`${styles.counter} ${isOver ? styles.counterOver : ""}`}>
                  {currentLength}/{maxLength}
                </span>
              )}
            </div>
          )}
        </div>
      </DisabledTooltip>
    );
  }
);
TextArea.displayName = "TextArea";
