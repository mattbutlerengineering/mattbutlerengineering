import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { precision } from "../../tokens/motion";
import { cn } from "../../utils/class-composer";
import { useCombobox } from "../../hooks/useCombobox";
import { useField } from "../../hooks/useField";
import styles from "./Combobox.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * A single selectable option. `value` is the stable identity, `label` is the
 * display text and type-ahead target, and `disabled` options are skipped.
 */
export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Combobox — an editable, filterable listbox built on the shared `useCombobox`
 * state machine. Supports single selection (Autocomplete-style) and multiple
 * selection with removable chips, plus async loading and empty states that are
 * announced through a polite live region.
 *
 * @example Single select
 * <Combobox label="Fruit" options={fruits} value={value} onChange={setValue} />
 *
 * @example Multi select
 * <Combobox
 *   label="Toppings"
 *   multiple
 *   options={toppings}
 *   values={values}
 *   onValuesChange={setValues}
 * />
 */
export interface ComboboxProps {
  options: ComboboxOption[];
  label?: string;
  hint?: string;
  /** Marks the field invalid (aria-invalid) and wires the error into the field chrome. */
  error?: boolean;
  required?: boolean;
  /** When true and not required, shows "(optional)" after the label. */
  showOptional?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Enables multiple selection with removable chips. */
  multiple?: boolean;
  /** Selected value (single mode, controlled). */
  value?: string;
  /** Fires with the chosen value (single mode). */
  onChange?: (value: string) => void;
  /** Selected values (multi mode, controlled). */
  values?: string[];
  /** Fires with the next selection array (multi mode). */
  onValuesChange?: (values: string[]) => void;
  /** Search text (controlled). Provide with `onInputChange` for async filtering. */
  inputValue?: string;
  /** Fires whenever the search text changes. */
  onInputChange?: (value: string) => void;
  /**
   * When true, options are filtered internally by a case-insensitive label
   * substring match. Set to false for async/server-side filtering where the
   * consumer supplies already-filtered `options`. Defaults to true.
   */
  filter?: boolean;
  /** Shows a loading row in the listbox and announces it. */
  loading?: boolean;
  /** Text shown (and announced) while `loading`. */
  loadingText?: string;
  /** Text shown when no options match. */
  emptyText?: string;
}

/* ── Chip subcomponent ───────────────────────── */

interface ComboboxChipProps {
  label: string;
  disabled?: boolean;
  onRemove: () => void;
}

function ComboboxChip({ label, disabled, onRemove }: ComboboxChipProps) {
  return (
    <span className={styles.chip}>
      <span className={styles.chipLabel}>{label}</span>
      <button
        type="button"
        className={styles.chipRemove}
        aria-label={`Remove ${label}`}
        disabled={disabled}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X size={12} aria-hidden />
      </button>
    </span>
  );
}

/* ── Helpers ─────────────────────────────────── */

const CheckIcon = () => (
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
);

/** Builds the polite live-region announcement for the current listbox state. */
function announce(
  open: boolean,
  loading: boolean,
  loadingText: string,
  count: number,
  emptyText: string
): string {
  if (!open) return "";
  if (loading) return loadingText;
  if (count === 0) return emptyText;
  return `${count} result${count === 1 ? "" : "s"} available`;
}

/* ── Component ───────────────────────────────── */

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(
  (
    {
      options,
      label,
      hint,
      error,
      required,
      showOptional,
      placeholder,
      disabled,
      className,
      id,
      multiple = false,
      value,
      onChange,
      values,
      onValuesChange,
      inputValue,
      onInputChange,
      filter = true,
      loading = false,
      loadingText = "Loading…",
      emptyText = "No results",
    },
    ref
  ) => {
    const field = useField({ id, hint, error, required, showOptional });
    const listboxId = `${field.id}-listbox`;
    const liveId = `${field.id}-live`;
    const optionId = (index: number) => `${field.id}-option-${index}`;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const shouldReduceMotion = useReducedMotion();

    // ── Selection state (controlled or internal) ──
    const [internalValue, setInternalValue] = useState("");
    const [internalValues, setInternalValues] = useState<string[]>([]);
    const selectedValue = value ?? internalValue;
    const selectedValues = values ?? internalValues;

    // ── Search text (controlled or internal) ──
    const [internalQuery, setInternalQuery] = useState<string | null>(null);
    const query = inputValue ?? internalQuery ?? "";

    // Options visible in the listbox: filtered by label unless async filtering.
    const visible =
      filter && query
        ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
        : options;

    const { open, focusedIndex, openWithFocus, close, setFocusedIndex } = useCombobox({
      items: visible,
      containerRef: wrapperRef,
    });

    // Open the listbox with nothing pre-highlighted (ARIA APG combobox pattern):
    // aria-activedescendant is only set once the user navigates with the arrows.
    const openList = useCallback(() => {
      openWithFocus();
      setFocusedIndex(-1);
    }, [openWithFocus, setFocusedIndex]);

    const setQuery = useCallback(
      (next: string) => {
        if (inputValue === undefined) setInternalQuery(next);
        onInputChange?.(next);
      },
      [inputValue, onInputChange]
    );

    // Keep the single-select input in sync with a controlled value change.
    useEffect(() => {
      if (multiple || inputValue !== undefined) return;
      const opt = options.find((o) => o.value === selectedValue);
      setInternalQuery(opt ? opt.label : "");
    }, [selectedValue, multiple, inputValue, options]);

    const commitValues = useCallback(
      (next: string[]) => {
        if (values === undefined) setInternalValues(next);
        onValuesChange?.(next);
      },
      [values, onValuesChange]
    );

    const handleSelect = useCallback(
      (option: ComboboxOption) => {
        if (option.disabled) return;
        if (multiple) {
          const has = selectedValues.includes(option.value);
          commitValues(
            has
              ? selectedValues.filter((v) => v !== option.value)
              : [...selectedValues, option.value]
          );
          setQuery("");
          setFocusedIndex(-1);
          inputRef.current?.focus();
        } else {
          if (value === undefined) setInternalValue(option.value);
          onChange?.(option.value);
          setQuery(option.label);
          close();
          inputRef.current?.focus();
        }
      },
      [multiple, selectedValues, commitValues, value, onChange, setQuery, close, setFocusedIndex]
    );

    const removeValue = useCallback(
      (v: string) => commitValues(selectedValues.filter((x) => x !== v)),
      [commitValues, selectedValues]
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        openList();
      },
      [setQuery, openList]
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && multiple && query === "" && selectedValues.length > 0) {
          removeValue(selectedValues[selectedValues.length - 1] as string);
          return;
        }
        if (!open) {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
          return;
        }
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setFocusedIndex(nextEnabled(visible, focusedIndex, 1));
            break;
          case "ArrowUp":
            e.preventDefault();
            setFocusedIndex(nextEnabled(visible, focusedIndex, -1));
            break;
          case "Home":
            e.preventDefault();
            setFocusedIndex(nextEnabled(visible, -1, 1));
            break;
          case "End":
            e.preventDefault();
            setFocusedIndex(nextEnabled(visible, visible.length, -1));
            break;
          case "Enter": {
            e.preventDefault();
            const opt = focusedIndex >= 0 ? visible[focusedIndex] : undefined;
            if (opt) handleSelect(opt);
            break;
          }
          case "Escape":
            e.preventDefault();
            close();
            break;
        }
      },
      [
        multiple,
        query,
        selectedValues,
        removeValue,
        open,
        openList,
        setFocusedIndex,
        visible,
        focusedIndex,
        handleSelect,
        close,
      ]
    );

    // Scroll the focused option into view.
    useEffect(() => {
      if (!open || focusedIndex < 0) return;
      const el = wrapperRef.current?.querySelector(`[data-option-index="${focusedIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }, [open, focusedIndex]);

    const setInputRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    const activeOptionId = open && focusedIndex >= 0 ? optionId(focusedIndex) : undefined;
    const chips = multiple
      ? selectedValues
          .map((v) => options.find((o) => o.value === v))
          .filter((o): o is ComboboxOption => o !== undefined)
      : [];
    const showEmpty = open && !loading && visible.length === 0;
    const liveMessage = announce(open, loading, loadingText, visible.length, emptyText);

    return (
      <div ref={wrapperRef} className={cn(styles.wrapper, className)}>
        {label && (
          <label htmlFor={field.id} className={styles.label}>
            {label}
            {field.requiredMarker}
            {field.showOptional && <span className={styles.optional}> (optional)</span>}
          </label>
        )}

        <div className={styles.control} data-open={open} data-disabled={disabled || undefined}>
          {chips.map((opt) => (
            <ComboboxChip
              key={opt.value}
              label={opt.label}
              disabled={disabled}
              onRemove={() => removeValue(opt.value)}
            />
          ))}
          <input
            ref={setInputRef}
            id={field.id}
            className={styles.input}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-required={field.controlProps.required}
            aria-invalid={field.controlProps["aria-invalid"]}
            aria-describedby={field.controlProps["aria-describedby"]}
            autoComplete="off"
            disabled={disabled}
            value={query}
            placeholder={chips.length === 0 ? placeholder : undefined}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => !open && openList()}
          />
        </div>

        <AnimatePresence>
          {open && (
            <motion.ul
              id={listboxId}
              role="listbox"
              aria-label={label}
              aria-multiselectable={multiple || undefined}
              className={styles.dropdown}
              initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={precision}
            >
              {loading ? (
                <li className={styles.status} role="option" aria-selected={false} aria-disabled>
                  <span className={styles.spinner} aria-hidden />
                  {loadingText}
                </li>
              ) : showEmpty ? (
                <li className={styles.status} role="option" aria-selected={false} aria-disabled>
                  {emptyText}
                </li>
              ) : (
                visible.map((option, index) => {
                  const isSelected = multiple
                    ? selectedValues.includes(option.value)
                    : option.value === selectedValue;
                  return (
                    <li
                      key={option.value}
                      id={optionId(index)}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      data-option-index={index}
                      data-selected={isSelected || undefined}
                      data-disabled={option.disabled || undefined}
                      className={cn(styles.option, focusedIndex === index && styles.optionActive)}
                      onMouseDown={(e) => {
                        e.preventDefault(); // keep focus on the input
                        handleSelect(option);
                      }}
                      onMouseEnter={() => setFocusedIndex(index)}
                    >
                      <CheckIcon />
                      {option.label}
                    </li>
                  );
                })
              )}
            </motion.ul>
          )}
        </AnimatePresence>

        <div id={liveId} className={styles.srOnly} role="status" aria-live="polite">
          {liveMessage}
        </div>

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

Combobox.displayName = "Combobox";

/* ── Navigation helper ───────────────────────── */

/**
 * Returns the next non-disabled index moving in `dir` from `from`. Returns
 * `from` (clamped) when no enabled option exists in that direction.
 */
function nextEnabled(options: ComboboxOption[], from: number, dir: 1 | -1): number {
  let i = from + dir;
  while (i >= 0 && i < options.length) {
    if (!options[i]?.disabled) return i;
    i += dir;
  }
  // No enabled option ahead: keep the current focus if it is valid.
  return from >= 0 && from < options.length ? from : -1;
}
