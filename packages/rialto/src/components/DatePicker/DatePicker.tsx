import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover } from "../Popover/Popover";
import { Input } from "../Input/Input";
import { Calendar, parseIsoDate } from "../Calendar/Calendar";
import { cn } from "../../utils/class-composer";
import styles from "./DatePicker.module.css";

type Placement = "top" | "bottom" | "left" | "right";

/**
 * A date field: a read-only trigger {@link Input} that opens a {@link Popover}
 * containing an inline {@link Calendar}. Controlled via an ISO `yyyy-mm-dd`
 * string — no `Date` objects cross the public boundary. Selecting a date (or
 * pressing Escape) closes the popover and returns focus to the trigger.
 * `Calendar` and `DateRange` share this same ISO-string vocabulary, per
 * ADR-024 (`docs/adr/ADR-024-date-value-vocabulary.md`).
 *
 * @example
 * const [date, setDate] = useState<string | null>(null);
 * <DatePicker label="Check-in" value={date} onChange={setDate} min="2026-01-01" />
 */
export interface DatePickerProps {
  /** Selected date as a `yyyy-mm-dd` ISO string, or `null` when empty. */
  value: string | null;
  /** Called with the newly selected date (`yyyy-mm-dd`). */
  onChange: (value: string | null) => void;
  /** Earliest selectable date (`yyyy-mm-dd`, inclusive). */
  min?: string;
  /** Latest selectable date (`yyyy-mm-dd`, inclusive). */
  max?: string;
  /**
   * Predicate deciding whether a date is disabled. When supplied it is
   * authoritative and wins over `min`/`max`.
   */
  isDateDisabled?: (isoDate: string) => boolean;
  /** BCP-47 locale for month/weekday labels and the formatted trigger value. */
  locale?: string;
  /** First day of the week, 0 (Sunday) … 6. Defaults to the locale, then Monday. */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Label rendered above the trigger input. */
  label?: string;
  /** Placeholder shown on the trigger input when no date is selected. */
  placeholder?: string;
  /** Popover placement relative to the trigger. */
  placement?: Placement;
  /** Trigger input id (associates the label). */
  id?: string;
  className?: string;
}

export const DatePicker = forwardRef<HTMLDivElement, DatePickerProps>(function DatePicker(
  {
    value,
    onChange,
    min,
    max,
    isDateDisabled,
    locale,
    weekStartsOn,
    label,
    placeholder,
    placement = "bottom",
    id,
    className,
  },
  ref
) {
  // Bumping the token remounts the Popover closed — the only external way to
  // dismiss the self-managed Popover on select/Escape.
  const [closeToken, setCloseToken] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const didMountRef = useRef(false);

  // Return focus to the trigger after a close — a mount-guarded effect, never
  // requestAnimationFrame (which testing-library does not await).
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    inputRef.current?.focus();
  }, [closeToken]);

  const handleSelect = useCallback(
    (next: string | null) => {
      onChange(next);
      setCloseToken((token) => token + 1);
    },
    [onChange]
  );

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setCloseToken((token) => token + 1);
    }
  };

  const parsed = value ? parseIsoDate(value) : null;
  const display = parsed
    ? new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)))
    : "";

  const trigger = (
    <Input
      ref={inputRef}
      id={id}
      label={label}
      value={display}
      placeholder={placeholder}
      readOnly
      role="combobox"
      endIcon={<CalendarIcon size={16} />}
      aria-label={label ? undefined : "Choose date"}
    />
  );

  return (
    <div ref={ref} className={cn(styles.wrapper, className)}>
      <Popover key={closeToken} trigger={trigger} placement={placement}>
        <div role="presentation" className={styles.panel} onKeyDown={handlePanelKeyDown}>
          <Calendar
            value={value}
            onChange={handleSelect}
            min={min}
            max={max}
            isDateDisabled={isDateDisabled}
            locale={locale}
            weekStartsOn={weekStartsOn}
          />
        </div>
      </Popover>
    </div>
  );
});

DatePicker.displayName = "DatePicker";
