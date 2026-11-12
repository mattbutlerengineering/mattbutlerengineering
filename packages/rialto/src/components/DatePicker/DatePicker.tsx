import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { Popover } from "../Popover/Popover";
import { Input, type InputProps } from "../Input/Input";
import { Calendar } from "../Calendar/Calendar";
import { cn } from "../../utils/class-composer";
import { bindCalendarFit } from "./fit-below";
import { useTypedDate } from "./useTypedDate";
import styles from "./DatePicker.module.css";

/**
 * The sheet is a child of the popover panel so its layout effect runs before
 * the panel is measured and placed. That is what lets a slightly-too-tall
 * month stay under the field instead of flipping over the page title.
 */
function CalendarSheet({ children, fitBelow }: { children: ReactNode; fitBelow: boolean }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    // The fit only knows how to make room under the field.
    if (!sheet || !fitBelow) return;
    return bindCalendarFit(sheet);
  }, [fitBelow]);
  return (
    <div ref={sheetRef} role="presentation" className={styles.panel} data-calendar-sheet="">
      {children}
    </div>
  );
}

type Placement = "top" | "bottom" | "left" | "right";

/**
 * A date field: a read-only trigger {@link Input} that opens a {@link Popover}
 * containing an inline {@link Calendar}. Controlled via an ISO `yyyy-mm-dd`
 * string — no `Date` objects cross the public boundary. Selecting a date (or
 * pressing Escape) closes the popover and returns focus to the trigger. On
 * open, focus lands on the selected day, or today when nothing is selected.
 * Pass `editable` to let the date be typed as well.
 * `Calendar` and `DateRange` share this same ISO-string vocabulary, per
 * ADR-024 (`docs/adr/ADR-024-date-value-vocabulary.md`).
 *
 * @example
 * const [date, setDate] = useState<string | null>(null);
 * <DatePicker label="Check-in" value={date} onChange={setDate} min="2026-01-01" />
 * <DatePicker label="Check-out" value={end} onChange={setEnd} editable defaultMonth={date ?? undefined} />
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
  /**
   * Let a date be typed into the field. Text is read on Enter or blur in the
   * field's locale: ISO `yyyy-mm-dd`, the locale's numeric order (`6/20/2024`),
   * or a month name with a day (`Jun 20, 2024`); without a year it is the next
   * such date from today. Text that is not a date, or a date that `min`, `max`
   * or `isDateDisabled` refuses, stays in the field with a problem beneath it
   * and `onChange(null)`. The calendar then opens on ArrowDown or from the
   * calendar button, not on a click in the field. Defaults to `false`.
   */
  editable?: boolean;
  /**
   * A date (`yyyy-mm-dd`) whose month the calendar opens on while `value` is
   * empty, e.g. the start date for an end-date field.
   */
  defaultMonth?: string;
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
    editable = false,
    defaultMonth,
    locale: localeProp,
    weekStartsOn,
    label,
    placeholder,
    placement = "bottom",
    id,
    className,
  },
  ref
) {
  const { locale: contextLocale, messages } = useRialtoLocale();
  const locale = localeProp ?? contextLocale;
  const [open, setOpen] = useState(false);
  const typed = useTypedDate({ value, onChange, locale, min, max, isDateDisabled, messages });
  const { discard } = typed;

  const handleSelect = useCallback(
    (next: string | null) => {
      discard();
      onChange(next);
      setOpen(false);
    },
    [discard, onChange]
  );

  // The popover toggles on any click, Enter or Space that reaches it from the
  // trigger. A field being typed into keeps those for itself, and opens the
  // calendar on ArrowDown or from the calendar button instead.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      // Read the text first, so the calendar opens on the date just typed.
      typed.commit();
      setOpen(true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      typed.commit();
    } else if (event.key === " ") {
      event.stopPropagation();
    }
  };

  // A read-only field gets none of the typing props, so it renders as it always has.
  const typing: InputProps = editable
    ? {
        autoComplete: "off",
        error: typed.problem !== null,
        hint: typed.problem ?? undefined,
        onChange: (event) => typed.type(event.target.value),
        onBlur: typed.commit,
        onClick: (event) => event.stopPropagation(),
        onKeyDown: handleKeyDown,
        endIcon: (
          <button
            type="button"
            // ArrowDown in the field is the keyboard path; this keeps one tab stop.
            tabIndex={-1}
            className={styles.calendarButton}
            aria-label={messages.chooseDate}
          >
            <CalendarIcon size={16} aria-hidden="true" />
          </button>
        ),
      }
    : { readOnly: true, endIcon: <CalendarIcon size={16} /> };

  const trigger = (
    <Input
      id={id}
      label={label}
      value={typed.text}
      placeholder={placeholder}
      role="combobox"
      aria-label={label ? undefined : messages.chooseDate}
      {...typing}
    />
  );

  return (
    <div ref={ref} className={cn(styles.wrapper, className)}>
      <Popover solid open={open} onOpenChange={setOpen} trigger={trigger} placement={placement}>
        <CalendarSheet fitBelow={placement === "bottom"}>
          <Calendar
            value={value}
            onChange={handleSelect}
            min={min}
            max={max}
            isDateDisabled={isDateDisabled}
            defaultMonth={defaultMonth}
            locale={locale}
            weekStartsOn={weekStartsOn}
          />
        </CalendarSheet>
      </Popover>
    </div>
  );
});

DatePicker.displayName = "DatePicker";
