import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover } from "../Popover/Popover";
import { Input } from "../Input/Input";
import { parseIsoDate } from "../Calendar/Calendar";
import { DateRange, type DateRangeValue } from "../DateRange/DateRange";
import { cn } from "../../utils/class-composer";
import styles from "./DateRangePicker.module.css";

type Placement = "top" | "bottom" | "left" | "right";

/**
 * A date-range field: a read-only trigger {@link Input} that opens a
 * {@link Popover} containing an inline {@link DateRange} grid. Controlled via
 * a {@link DateRangeValue} of ISO `yyyy-mm-dd` strings — no `Date` objects
 * cross the public boundary. Picking the first endpoint keeps the popover
 * open; completing the range (or pressing Escape) closes it and returns
 * focus to the trigger. `Calendar`/`DatePicker`/`DateRange` share this same
 * ISO-string vocabulary, per ADR-024
 * (`docs/adr/ADR-024-date-value-vocabulary.md`).
 *
 * @example
 * const [range, setRange] = useState<DateRangeValue>({ start: null, end: null });
 * <DateRangePicker label="Stay dates" value={range} onChange={setRange} min="2026-01-01" />
 */
export interface DateRangePickerProps {
  /** The selected range. `end` is `null` while the second endpoint is being picked. */
  value: DateRangeValue;
  /** Called with the next range. Endpoints are always ordered (`start` ≤ `end`). */
  onChange: (value: DateRangeValue) => void;
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
  /** Placeholder shown on the trigger input when no range is selected. */
  placeholder?: string;
  /** Popover placement relative to the trigger. */
  placement?: Placement;
  /** Trigger input id (associates the label). */
  id?: string;
  className?: string;
}

function formatIso(iso: string, locale: string | undefined): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

function formatRange(value: DateRangeValue, locale: string | undefined): string {
  if (!value.start) return "";
  if (!value.end) return formatIso(value.start, locale);
  return `${formatIso(value.start, locale)} – ${formatIso(value.end, locale)}`;
}

export const DateRangePicker = forwardRef<HTMLDivElement, DateRangePickerProps>(
  function DateRangePicker(
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
    // dismiss the self-managed Popover on range completion/Escape.
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
      (next: DateRangeValue) => {
        onChange(next);
        // Only close once both endpoints are picked — the first click sets the
        // start and should keep the popover open for the second click.
        if (next.start && next.end) {
          setCloseToken((token) => token + 1);
        }
      },
      [onChange]
    );

    const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        setCloseToken((token) => token + 1);
      }
    };

    const display = formatRange(value, locale);

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
        aria-label={label ? undefined : "Choose date range"}
      />
    );

    return (
      <div ref={ref} className={cn(styles.wrapper, className)}>
        <Popover key={closeToken} trigger={trigger} placement={placement}>
          <div role="presentation" className={styles.panel} onKeyDown={handlePanelKeyDown}>
            <DateRange
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
  }
);

DateRangePicker.displayName = "DateRangePicker";
