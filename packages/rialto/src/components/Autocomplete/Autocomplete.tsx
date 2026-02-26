import {
  forwardRef,
  useState,
  useRef,
  useCallback,
  useId,
  useEffect,
  type InputHTMLAttributes,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { precision } from '../../tokens/motion';
import styles from './Autocomplete.module.css';

export interface AutocompleteOption {
  value: string;
  label: string;
}

export interface AutocompleteProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'onChange' | 'onSelect'
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
      emptyText = 'No results',
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

    const [internalValue, setInternalValue] = useState('');
    const inputValue = controlledValue ?? internalValue;

    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const filtered = options.filter((opt) =>
      opt.label.toLowerCase().includes(inputValue.toLowerCase())
    );

    const setInputValue = useCallback(
      (val: string) => {
        if (controlledValue === undefined) setInternalValue(val);
        onChange?.(val);
      },
      [controlledValue, onChange]
    );

    const handleSelect = useCallback(
      (option: AutocompleteOption) => {
        setInputValue(option.label);
        onSelect?.(option);
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.focus();
      },
      [setInputValue, onSelect]
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        setIsOpen(true);
        setActiveIndex(-1);
      },
      [setInputValue]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault();
          setIsOpen(true);
          return;
        }

        if (!isOpen) return;

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setActiveIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
            break;
          case 'ArrowUp':
            e.preventDefault();
            setActiveIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
            break;
          case 'Enter':
            e.preventDefault();
            if (activeIndex >= 0 && filtered[activeIndex]) {
              handleSelect(filtered[activeIndex]);
            }
            break;
          case 'Escape':
            e.preventDefault();
            setIsOpen(false);
            setActiveIndex(-1);
            break;
        }
      },
      [isOpen, activeIndex, filtered, handleSelect]
    );

    // Close on outside click
    useEffect(() => {
      function handleClick(e: MouseEvent) {
        if (
          wrapperRef.current &&
          !wrapperRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
          setActiveIndex(-1);
        }
      }
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Scroll active option into view
    useEffect(() => {
      if (activeIndex < 0) return;
      const activeEl = wrapperRef.current?.querySelector(
        `[data-option-index="${activeIndex}"]`
      );
      activeEl?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const activeOptionId =
      activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined;

    return (
      <div
        ref={wrapperRef}
        className={[styles.wrapper, className].filter(Boolean).join(' ')}
      >
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {required && <span className={styles.required}> *</span>}
            {showOptional && !required && (
              <span className={styles.optional}> (optional)</span>
            )}
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
              if (typeof ref === 'function') ref(node);
              else if (ref) ref.current = node;
            }}
            id={inputId}
            className={styles.input}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            autoComplete="off"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => inputValue && setIsOpen(true)}
            placeholder={placeholder}
            required={required}
            {...props}
          />
        </div>

        <AnimatePresence>
          {isOpen && (
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
                <li
                  className={styles.empty}
                  role="option"
                  aria-selected={false}
                  aria-disabled
                >
                  {emptyText}
                </li>
              ) : (
                filtered.map((option, index) => (
                  <li
                    key={option.value}
                    id={`${inputId}-option-${index}`}
                    role="option"
                    aria-selected={activeIndex === index}
                    data-option-index={index}
                    className={[
                      styles.option,
                      activeIndex === index && styles.optionActive,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep focus on input
                      handleSelect(option);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {option.label}
                  </li>
                ))
              )}
            </motion.ul>
          )}
        </AnimatePresence>

        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
    );
  }
);

Autocomplete.displayName = 'Autocomplete';
