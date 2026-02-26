import {
  forwardRef,
  useId,
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { springGentle } from "../../tokens/motion";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
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
      placeholder = "Select\u2026",
      label,
      disabled,
      disabledReason,
      className,
    },
    ref
  ) => {
    const baseId = useId();
    const listboxId = `${baseId}-listbox`;
    const optionId = (index: number) => `${baseId}-option-${index}`;

    const [open, setOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const typeaheadRef = useRef("");
    const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const shouldReduceMotion = useReducedMotion();

    const selectedOption = options.find((o) => o.value === value);

    // Close on outside click
    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        const wrapper =
          (ref as React.RefObject<HTMLDivElement>)?.current ?? triggerRef.current?.parentElement;
        if (wrapper && !wrapper.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open, ref]);

    // Compute the initial focused index for when the dropdown opens
    const openWithFocus = useCallback(() => {
      const idx = value ? options.findIndex((o) => o.value === value) : 0;
      setFocusedIndex(idx >= 0 ? idx : 0);
      setOpen(true);
    }, [value, options]);

    const select = useCallback(
      (optionValue: string) => {
        onChange?.(optionValue);
        setOpen(false);
        triggerRef.current?.focus();
      },
      [onChange]
    );

    // Type-ahead: match option labels by typed characters
    const handleTypeahead = useCallback(
      (char: string) => {
        clearTimeout(typeaheadTimerRef.current);
        typeaheadRef.current += char.toLowerCase();
        typeaheadTimerRef.current = setTimeout(() => (typeaheadRef.current = ""), 500);

        const query = typeaheadRef.current;
        const startIndex = open ? focusedIndex + 1 : 0;

        // Search from current position, then wrap around
        for (let i = 0; i < options.length; i++) {
          const idx = (startIndex + i) % options.length;
          const opt = options[idx];
          if (opt && !opt.disabled && opt.label.toLowerCase().startsWith(query)) {
            if (open) {
              setFocusedIndex(idx);
            } else {
              // When closed, type-ahead selects directly
              select(opt.value);
            }
            return;
          }
        }
      },
      [open, focusedIndex, options, select]
    );

    const handleKeyDown = (e: KeyboardEvent) => {
      // Type-ahead for printable single characters
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleTypeahead(e.key);
        if (!open) openWithFocus();
        return;
      }

      if (!open) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openWithFocus();
          return;
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex((prev) => {
            let next = prev + 1;
            while (next < options.length && options[next]?.disabled) next++;
            return next < options.length ? next : prev;
          });
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => {
            let next = prev - 1;
            while (next >= 0 && options[next]?.disabled) next--;
            return next >= 0 ? next : prev;
          });
          break;
        }
        case "Home": {
          e.preventDefault();
          const first = options.findIndex((o) => !o.disabled);
          if (first >= 0) setFocusedIndex(first);
          break;
        }
        case "End": {
          e.preventDefault();
          for (let i = options.length - 1; i >= 0; i--) {
            if (!options[i]?.disabled) {
              setFocusedIndex(i);
              break;
            }
          }
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          const focused = options[focusedIndex];
          if (focused && !focused.disabled) {
            select(focused.value);
          }
          break;
        }
        case "Tab":
          setOpen(false);
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
          break;
      }
    };

    // Scroll focused option into view
    useEffect(() => {
      if (!open || focusedIndex < 0) return;
      const list = listRef.current;
      if (!list) return;
      const el = list.children[focusedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }, [open, focusedIndex]);

    // Clean up typeahead timer
    useEffect(() => {
      const timer = typeaheadTimerRef;
      return () => clearTimeout(timer.current);
    }, []);

    const focusedOption = focusedIndex >= 0 ? options[focusedIndex] : undefined;

    return (
      <div ref={ref} className={[styles.wrapper, className].filter(Boolean).join(" ")}>
        {label && <span className={styles.label}>{label}</span>}
        <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
          <button
            ref={triggerRef}
            onKeyDown={disabled ? undefined : handleKeyDown}
            className={styles.trigger}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-haspopup="listbox"
            aria-label={label}
            aria-activedescendant={open && focusedOption ? optionId(focusedIndex) : undefined}
            aria-disabled={disabled || undefined}
            data-open={open}
            onClick={
              disabled ? (e) => e.preventDefault() : () => (open ? setOpen(false) : openWithFocus())
            }
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
                  onKeyDown={handleKeyDown}
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
                  >
                    <path d="M2.5 7.5l3 3 6-7" />
                  </svg>
                  {option.label}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

Select.displayName = "Select";
