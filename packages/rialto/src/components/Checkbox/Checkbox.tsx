import { forwardRef, useId, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { spring, boop } from '../../tokens/motion';
import { DisabledTooltip } from '../DisabledTooltip/DisabledTooltip';
import styles from './Checkbox.module.css';

/* ── Checkbox ────────────────────────────────── */

/**
 * Checkbox with animated check/indeterminate mark, label, and optional description.
 * Supports a three-state visual (unchecked, checked, indeterminate) with spring animation.
 *
 * @example
 * <Checkbox label="Accept terms" checked={ok} onCheckedChange={setOk} />
 * <Checkbox label="Select all" indeterminate description="3 of 5 selected" />
 * <Checkbox label="Archived" disabled />
 */
interface CheckboxProps {
  label: string;
  checked?: boolean;
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
      checked = false,
      indeterminate = false,
      onCheckedChange,
      disabled = false,
      disabledReason,
      description,
      className = '',
    },
    ref
  ) => {
    const id = useId();
    const shouldReduceMotion = useReducedMotion();

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div
          ref={ref}
          className={`${styles.checkboxItem} ${className}`}
          aria-disabled={disabled || undefined}
        >
          <label className={styles.label} htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              className={styles.input}
              checked={checked}
              disabled={disabled}
              data-indeterminate={indeterminate || undefined}
              ref={(el) => {
                if (el) el.indeterminate = indeterminate;
              }}
              onChange={(e) => onCheckedChange?.(e.target.checked)}
            />
            <motion.span
              className={styles.box}
              whileHover={
                disabled || shouldReduceMotion
                  ? undefined
                  : { scale: boop.scale, transition: boop.transition }
              }
            >
              <motion.span
                className={styles.check}
                animate={
                  checked || indeterminate
                    ? { scale: 1, opacity: 1 }
                    : { scale: 0, opacity: 0 }
                }
                transition={shouldReduceMotion ? { duration: 0 } : spring}
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
                  >
                    <path d="M2 5.5L4 7.5L8 3" />
                  </svg>
                )}
              </motion.span>
            </motion.span>
            <span className={styles.checkboxText}>
              {label}
              {description && (
                <span className={styles.checkboxDescription}>
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
Checkbox.displayName = 'Checkbox';

/* ── Radio ───────────────────────────────────── */

/**
 * Single radio button with an animated dot indicator and optional description.
 * Typically used inside a `RadioGroup`, which auto-injects `name`, `checked`, and `onCheckedChange`.
 *
 * @example
 * <Radio label="Small" value="sm" />
 * <Radio label="Large" value="lg" description="Best for readability" />
 */
interface RadioProps {
  label: string;
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
      className = '',
    },
    ref
  ) => {
    const id = useId();
    const shouldReduceMotion = useReducedMotion();

    return (
      <DisabledTooltip disabled={disabled} disabledReason={disabledReason}>
        <div
          ref={ref}
          className={`${styles.radioItem} ${className}`}
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
              onChange={() => onCheckedChange?.(value)}
            />
            <motion.span
              className={styles.circle}
              whileHover={
                disabled || shouldReduceMotion
                  ? undefined
                  : { scale: boop.scale, transition: boop.transition }
              }
            >
              <motion.span
                className={styles.dot}
                animate={
                  checked ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }
                }
                transition={shouldReduceMotion ? { duration: 0 } : spring}
              />
            </motion.span>
            <span className={styles.radioText}>
              {label}
              {description && (
                <span className={styles.radioDescription}>{description}</span>
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
Radio.displayName = 'Radio';

/* ── Radio Group ─────────────────────────────── */

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
interface RadioGroupProps {
  label?: string;
  /** Shared HTML `name` attribute for all child radios */
  name: string;
  /** Currently selected radio value */
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(
  ({ label, name, value, onChange, children, className = '' }, ref) => {
    return (
      <fieldset
        ref={ref}
        className={`${styles.radioGroup} ${className}`}
        role="radiogroup"
      >
        {label && <legend className={styles.radioGroupLabel}>{label}</legend>}
        {/* Clone children to inject name/value/onChange */}
        {Array.isArray(children)
          ? children.map((child, i) => {
              if (child && typeof child === 'object' && 'props' in child) {
                return (
                  <Radio
                    key={child.props.value ?? i}
                    {...child.props}
                    name={name}
                    checked={child.props.value === value}
                    onCheckedChange={onChange}
                  />
                );
              }
              return child;
            })
          : children}
      </fieldset>
    );
  }
);
RadioGroup.displayName = 'RadioGroup';
