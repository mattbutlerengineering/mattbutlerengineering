import {
  forwardRef,
  useState,
  useRef,
  useCallback,
  useId,
  useEffect,
  type InputHTMLAttributes,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { precision } from "../../tokens/motion";
import { cn } from "../../utils/class-composer";
import { useCombobox } from "../../hooks/useCombobox";
import styles from "./Autocomplete.module.css";

export interface AutocompleteOption {
  value: string;
  label: string;
}

export interface AutocompleteProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "onChange" | "onSelect"
> {
  label?: string;
  hint?: string;
  options: AutocompleteOption[];
  value?: string;
  onChange?: (value: string) => void;
  onSelect?: (option: AutocompleteOption) => void;
  /** Text shown when no options match */
  emptyText?: string;
  showOptional?: boolean;
}

export const Autocomplete = forwardRef<HTMLInputElement, AutocompleteProps>(
  (
    {
      label,
      hint,
      options,
      value: controlledValue,
      onChange,
      onSelect,
      emptyText = "No results",
      showOptional,
      className,
      id,
      required,
      placeholder,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const listboxId = `${inputId}-listbox`;
    const shouldReduceMotion = useReducedMotion();

    const [internalValue, setInternalValue] = useState("");
    const inputValue = controlledValue ?? internalValue;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const filtered = options.filter((opt) =>
      opt.label.toLowerCase().includes(inputValue.toLowerCase())
    );

    // Map AutocompleteOption[] to ComboboxItem[] for the hook.
    // Autocomplete options are never disabled, so we pass them as-is.
    const comboboxItems = filtered;

    const setInputValue = useCallback(
      (val: string) => {
        if (controlledValue === undefined) setInternalValue(val);
        onChange?.(val);
      },
      [controlledValue, onChange]
    );

    const handleSelectOption = useCallback(
      (option: AutocompleteOption) => {
        setInputValue(option.label);
        onSelect?.(option);
        inputRef.current?.focus();
      },
      [setInputValue, onSelect]
    );

    const { open, focusedIndex, openWithFocus, close, setFocusedIndex } = useCombobox({
      items: comboboxItems,
      containerRef: wrapperRef,
    });

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        openWithFocus();
        setFocusedIndex(-1);
      },
      [setInputValue, openWithFocus, setFocusedIndex]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          openWithFocus();
          return;
        }

        if (!open) return;

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setFocusedIndex(focusedIndex < filtered.length - 1 ? focusedIndex + 1 : 0);
            break;
          case "ArrowUp":
            e.preventDefault();
            setFocusedIndex(focusedIndex > 0 ? focusedIndex - 1 : filtered.length - 1);
            break;
          case "Enter":
            e.preventDefault();
            if (focusedIndex >= 0 && filtered[focusedIndex]) {
              handleSelectOption(filtered[focusedIndex]);
              close();
            }
            break;
          case "Escape":
            e.preventDefault();
            close();
            break;
        }
      },
      [open, focusedIndex, filtered, handleSelectOption, openWithFocus, close, setFocusedIndex]
    );

    // Scroll active option into view
    useEffect(() => {
      if (focusedIndex < 0) return;
      const activeEl = wrapperRef.current?.querySelector(`[data-option-index="${focusedIndex}"]`);
      activeEl?.scrollIntoView({ block: "nearest" });
    }, [focusedIndex]);

    const activeOptionId = focusedIndex >= 0 ? `${inputId}-option-${focusedIndex}` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;

    return (
      <div ref={wrapperRef} className={cn(styles.wrapper, className)}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {required && (
              <span className={styles.required} aria-hidden="true">
                {" "}
                *
              </span>
            )}
            {showOptional && !required && <span className={styles.optional}> (optional)</span>}
          </label>
        )}

        <div className={styles.inputContainer}>
          <span className={styles.searchIcon} aria-hidden>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
          </span>
          <input
            ref={(node) => {
              inputRef.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            id={inputId}
            className={styles.input}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-describedby={hintId}
            autoComplete="off"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => inputValue && openWithFocus()}
            placeholder={placeholder}
            required={required}
            {...props}
          />
        </div>

        <AnimatePresence>
          {open && (
            <motion.ul
              id={listboxId}
              role="listbox"
              className={styles.dropdown}
              initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={precision}
            >
              {filtered.length === 0 ? (
                <li className={styles.empty} role="option" aria-selected={false} aria-disabled>
                  {emptyText}
                </li>
              ) : (
                filtered.map((option, index) => (
                  <li
                    key={option.value}
                    id={`${inputId}-option-${index}`}
                    role="option"
                    aria-selected={focusedIndex === index}
                    data-option-index={index}
                    className={cn(styles.option, focusedIndex === index && styles.optionActive)}
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep focus on input
                      handleSelectOption(option);
                      close();
                    }}
                    onMouseEnter={() => setFocusedIndex(index)}
                  >
                    {option.label}
                  </li>
                ))
              )}
            </motion.ul>
          )}
        </AnimatePresence>

        {hint && (
          <span id={hintId} className={styles.hint}>
            {hint}
          </span>
        )}
      </div>
    );
  }
);

Autocomplete.displayName = "Autocomplete";
