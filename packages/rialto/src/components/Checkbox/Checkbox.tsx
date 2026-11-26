import { Children, forwardRef, isValidElement, useId, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { CircleAlert, Lock } from "lucide-react";
import { cn } from "../../utils/class-composer";
import { DisabledTooltip } from "../DisabledTooltip/DisabledTooltip";
import styles from "./Checkbox.module.css";

/* ── Checkbox ────────────────────────────────── */

/**
 * Checkbox with animated check/indeterminate mark, label, and optional description.
 * Supports a three-state visual (unchecked, checked, indeterminate) with spring animation.
 *
 * @example
 * <Checkbox label="Accept terms" checked={ok} onCheckedChange={setOk} />
 * <Checkbox label="Select all" indeterminate description="3 of 5 selected" />
 * <Checkbox label="Archived" disabled />
 * <Checkbox label="Uncontrolled" defaultChecked />
 */
export interface CheckboxProps {
  label: ReactNode;
  checked?: boolean;
  /** Initial checked state for uncontrolled use (ignored when `checked` is provided) */
  defaultChecked?: boolean;
  required?: boolean;
  /** Displays a dash instead of a checkmark — useful for "select all" with partial selection */
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Explains why the checkbox is disabled. Shown in a tooltip; requires `disabled` to be true. */
  disabledReason?: string;
  /** Secondary text rendered below the label */
  description?: string;
  className?: string;
}

export const Checkbox = forwardRef<HTMLDivElement, CheckboxProps>(
  (
    {
      label,
      checked: checkedProp,
      defaultChecked = false,
      required = false,
      indeterminate = false,
      onCheckedChange,
      disabled = false,
      disabledReason,
      description,
      className = "",
    },
    ref
  ) => {
    const id = useId();
    const descId = useId();
    const motionPreset = useMotionPreset();
    const [uncontrolledChecked, setUncontrolledChecked] = useState(defaultChecked);
    const isControlled = checkedProp !== undefined;
    const checked = isControlled ? checkedProp : uncontrolledChecked;

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div
          ref={ref}
          className={cn(styles.checkboxItem, className)}
          aria-disabled={disabled || undefined}
        >
          <label className={styles.label} htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              className={styles.input}
              checked={checked}
              required={required}
              aria-required={required || undefined}
              disabled={disabled}
              data-indeterminate={indeterminate || undefined}
              aria-describedby={description ? descId : undefined}
              ref={(el) => {
                if (el) el.indeterminate = indeterminate;
              }}
              onChange={(e) => {
                const next = e.target.checked;
                if (!isControlled) setUncontrolledChecked(next);
                onCheckedChange?.(next);
              }}
            />
            <motion.span className={styles.box}>
              <motion.span
                className={styles.check}
                animate={
                  checked || indeterminate ? { scale: 1, opacity: 1 } : { scale: 0.9, opacity: 0 }
                }
                transition={motionPreset.spring}
              >
                {indeterminate ? (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M2 5h6" />
                  </svg>
                ) : (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 5.5L4 7.5L8 3" />
                  </svg>
                )}
              </motion.span>
            </motion.span>
            <span className={styles.checkboxText}>
              {label}
              {description && (
                <span id={descId} className={styles.checkboxDescription}>
                  {description}
                </span>
              )}
            </span>
            {disabled && disabledReason && (
              <Lock size={12} aria-hidden className={styles.lockIcon} />
            )}
          </label>
        </div>
      </DisabledTooltip>
    );
  }
);
Checkbox.displayName = "Checkbox";

/* ── Radio ───────────────────────────────────── */

/**
 * Single radio button with an animated dot indicator and optional description.
 * Typically used inside a `RadioGroup`, which auto-injects `name`, `checked`, and `onCheckedChange`.
 *
 * @example
 * <Radio label="Small" value="sm" />
 * <Radio label="Large" value="lg" description="Best for readability" />
 */
export interface RadioProps {
  label: ReactNode;
  value: string;
  /** Provided automatically by RadioGroup — only needed for standalone use */
  name?: string;
  checked?: boolean;
  onCheckedChange?: (value: string) => void;
  disabled?: boolean;
  /** Explains why the radio is disabled. Shown in a tooltip; requires `disabled` to be true. */
  disabledReason?: string;
  /** Secondary text rendered below the label */
  description?: string;
  /** Provided automatically by RadioGroup `required` */
  required?: boolean;
  className?: string;
}

export const Radio = forwardRef<HTMLDivElement, RadioProps>(
  (
    {
      label,
      value,
      name,
      checked = false,
      onCheckedChange,
      disabled = false,
      disabledReason,
      description,
      required,
      className = "",
    },
    ref
  ) => {
    const id = useId();
    const descId = useId();
    const motionPreset = useMotionPreset();

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div
          ref={ref}
          className={cn(styles.radioItem, className)}
          aria-disabled={disabled || undefined}
        >
          <label className={styles.label} htmlFor={id}>
            <input
              id={id}
              type="radio"
              name={name}
              value={value}
              className={styles.input}
              checked={checked}
              disabled={disabled}
              required={required}
              aria-describedby={description ? descId : undefined}
              onChange={() => onCheckedChange?.(value)}
            />
            <motion.span
              className={styles.circle}
              whileHover={disabled ? undefined : motionPreset.boop}
            >
              <motion.span
                className={styles.dot}
                animate={checked ? { scale: 1, opacity: 1 } : { scale: 0.9, opacity: 0 }}
                transition={motionPreset.spring}
              />
            </motion.span>
            <span className={styles.radioText}>
              {label}
              {description && (
                <span id={descId} className={styles.radioDescription}>
                  {description}
                </span>
              )}
            </span>
            {disabled && disabledReason && (
              <Lock size={12} aria-hidden className={styles.lockIcon} />
            )}
          </label>
        </div>
      </DisabledTooltip>
    );
  }
);
Radio.displayName = "Radio";

/* ── Radio Group ─────────────────────────────── */

/** Bundlers replace `process.env.NODE_ENV`; declared locally because rialto does not load Node types. */
declare const process: { env: { NODE_ENV?: string } } | undefined;

export interface RadioGroupOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Groups `Radio` children into a single controlled selection. Renders a `<fieldset>` with
 * `role="radiogroup"` and injects `name`, `checked`, and change handling into each child.
 *
 * @example
 * <RadioGroup label="Size" name="size" value={size} onChange={setSize}>
 *   <Radio label="Small" value="sm" />
 *   <Radio label="Medium" value="md" />
 *   <Radio label="Large" value="lg" />
 * </RadioGroup>
 */
export interface RadioGroupProps {
  label?: string;
  /** Shared HTML `name` attribute for all child radios */
  name: string;
  /** Currently selected radio value */
  value: string;
  onChange: (value: string) => void;
  /** `Radio` children. Wins over `options` when both are passed. */
  children?: ReactNode;
  /** Options-array form, rendered when `children` is absent */
  options?: RadioGroupOption[];
  /** Layout direction; also exposed as `aria-orientation` */
  orientation?: "vertical" | "horizontal";
  /** Helper text below the legend */
  description?: string;
  /** Error message below the legend; sets `aria-invalid` on the group */
  error?: string;
  required?: boolean;
  className?: string;
}

export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(
  (
    {
      label,
      name,
      value,
      onChange,
      children,
      options,
      orientation = "vertical",
      description,
      error,
      required,
      className = "",
    },
    ref
  ) => {
    const descId = useId();
    const errorId = useId();
    const hasChildren = Children.count(children) > 0;
    if (
      hasChildren &&
      options &&
      typeof process !== "undefined" &&
      process.env.NODE_ENV !== "production"
    ) {
      console.warn("RadioGroup: pass either `children` or `options`, not both. `children` wins.");
    }
    const describedBy =
      [description ? descId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

    return (
      <fieldset
        ref={ref}
        className={cn(
          styles.radioGroup,
          orientation === "horizontal" && styles.radioGroupHorizontal,
          className
        )}
        role="radiogroup"
        aria-orientation={orientation}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
      >
        {label && <legend className={styles.radioGroupLabel}>{label}</legend>}
        {description && (
          <span id={descId} className={styles.radioGroupDescription}>
            {description}
          </span>
        )}
        {error && (
          <span id={errorId} className={styles.radioGroupError}>
            <CircleAlert size={14} aria-hidden />
            {error}
          </span>
        )}
        {/* Clone children to inject name/value/onChange */}
        {hasChildren
          ? Children.map(children, (child) =>
              isValidElement<RadioProps>(child) ? (
                <Radio
                  {...child.props}
                  name={name}
                  required={required ?? child.props.required}
                  checked={child.props.value === value}
                  onCheckedChange={onChange}
                />
              ) : (
                child
              )
            )
          : options?.map((opt) => (
              <Radio
                key={opt.value}
                {...opt}
                name={name}
                required={required}
                checked={opt.value === value}
                onCheckedChange={onChange}
              />
            ))}
      </fieldset>
    );
  }
);
RadioGroup.displayName = "RadioGroup";
