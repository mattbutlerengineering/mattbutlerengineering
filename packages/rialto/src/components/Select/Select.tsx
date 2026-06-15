import { forwardRef, useRef, useEffect, type KeyboardEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { springGentle } from "../../tokens/motion";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
import { useCombobox } from "../../hooks/useCombobox";
import { useField } from "../../hooks/useField";
import styles from "./Select.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * Describes a single option inside a `Select` dropdown.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Custom dropdown select with keyboard navigation, animated open/close, and option highlighting.
 * Renders a combobox trigger button and an animated listbox — not a native `<select>`.
 *
 * @example
 * <Select
 *   label="Country"
 *   options={[{ value: "us", label: "United States" }, { value: "ca", label: "Canada" }]}
 *   value={country}
 *   onChange={setCountry}
 * />
 */
export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  error?: boolean;
  required?: boolean;
  /** When true and not required, shows "(optional)" after the label */
  showOptional?: boolean;
  disabled?: boolean;
  /** Explains why the select is disabled. Shown in a tooltip; requires `disabled` to be true. */
  disabledReason?: string;
  className?: string;
}

/* ── Component ───────────────────────────────── */
export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      options,
      value,
      onChange,
      placeholder = "Select…",
      label,
      hint,
      error,
      required,
      showOptional: showOptionalProp,
      disabled,
      disabledReason,
      className,
    },
    ref
  ) => {
    const field = useField({ hint, error, required, showOptional: showOptionalProp });
    const triggerId = `${field.id}-trigger`;
    const listboxId = `${field.id}-listbox`;
    const optionId = (index: number) => `${field.id}-option-${index}`;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const shouldReduceMotion = useReducedMotion();

    const { open, focusedIndex, toggle, select, setFocusedIndex, handleKeyDown } = useCombobox({
      items: options,
      value,
      onSelect: onChange,
      containerRef: wrapperRef,
      onRequestTriggerFocus: () => triggerRef.current?.focus(),
    });

    const selectedOption = options.find((o) => o.value === value);

    // Scroll focused option into view
    useEffect(() => {
      if (!open || focusedIndex < 0) return;
      const list = listRef.current;
      if (!list) return;
      const el = list.children[focusedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }, [open, focusedIndex]);

    const onTriggerKeyDown = (e: KeyboardEvent) => handleKeyDown(e);

    const focusedOption = focusedIndex >= 0 ? options[focusedIndex] : undefined;

    const mergeRef = (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    return (
      <div ref={mergeRef} className={[styles.wrapper, className].filter(Boolean).join(" ")}>
        {label && (
          <label htmlFor={triggerId} className={styles.label}>
            {label}
            {field.showRequired && (
              <span className={styles.required} aria-hidden="true">
                {" "}
                *
              </span>
            )}
            {field.showOptional && <span className={styles.optional}> (optional)</span>}
          </label>
        )}
        <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
          <button
            ref={triggerRef}
            id={triggerId}
            onKeyDown={disabled ? undefined : onTriggerKeyDown}
            className={styles.trigger}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-haspopup="listbox"
            aria-activedescendant={open && focusedOption ? optionId(focusedIndex) : undefined}
            aria-disabled={disabled || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={field.controlProps["aria-describedby"]}
            data-open={open}
            onClick={disabled ? (e) => e.preventDefault() : () => toggle()}
          >
            <span className={`${styles.triggerText} ${!selectedOption ? styles.placeholder : ""}`}>
              {selectedOption?.label ?? placeholder}
            </span>
            {disabled && disabledReason && (
              <Lock size={12} aria-hidden className={styles.lockIcon} />
            )}
            <motion.svg
              className={styles.chevron}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
              animate={{ rotate: open ? 180 : 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : springGentle}
            >
              <path d="M2.5 4.5l3.5 3.5 3.5-3.5" />
            </motion.svg>
          </button>
        </DisabledTooltip>

        <AnimatePresence>
          {open && (
            <motion.div
              ref={listRef}
              id={listboxId}
              className={styles.dropdown}
              role="listbox"
              aria-label={label}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.95, y: -4 }}
              animate={{ opacity: 1, scaleY: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.95, y: -4 }}
              transition={shouldReduceMotion ? { duration: 0 } : springGentle}
            >
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={optionId(index)}
                  className={styles.option}
                  role="option"
                  tabIndex={-1}
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  data-selected={option.value === value}
                  data-focused={index === focusedIndex}
                  data-disabled={option.disabled || undefined}
                  onClick={option.disabled ? undefined : () => select(option.value)}
                  onKeyDown={onTriggerKeyDown}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  <svg
                    className={styles.check}
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2.5 7.5l3 3 6-7" />
                  </svg>
                  {option.label}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {hint && (
          <span
            {...field.descriptionProps}
            className={styles.hint}
            role={error ? "alert" : undefined}
          >
            {hint}
          </span>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
