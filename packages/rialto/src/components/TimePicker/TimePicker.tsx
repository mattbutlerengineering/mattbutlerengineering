import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Popover } from "../Popover/Popover";
import { Input } from "../Input/Input";
import { cn } from "../../utils/class-composer";
import { TimeList } from "./TimeList";
import { formatTimeDisplay } from "./time-grid";
import styles from "./TimePicker.module.css";

type Placement = "top" | "bottom" | "left" | "right";

/** Default interval — matches the reservation slot-interval domain default. */
const DEFAULT_STEP_MINUTES = 15;

/**
 * A time field: a read-only trigger {@link Input} that opens a {@link Popover}
 * containing a listbox of interval slots. Controlled via a 24h `HH:mm` string —
 * no `Date` objects cross the public boundary. Selecting a time (or pressing
 * Escape) closes the popover and returns focus to the trigger.
 *
 * @example
 * const [time, setTime] = useState<string | null>(null);
 * <TimePicker label="Arrival" value={time} onChange={setTime} step={30} min="09:00" />
 */
export interface TimePickerProps {
  /** Selected time as a 24h `HH:mm` string, or `null` when empty. */
  value: string | null;
  /** Called with the newly selected time (`HH:mm`). */
  onChange: (value: string | null) => void;
  /** Interval between slots, in minutes. Defaults to 15. */
  step?: number;
  /** Earliest selectable time (`HH:mm`, inclusive). */
  min?: string;
  /** Latest selectable time (`HH:mm`, inclusive). */
  max?: string;
  /**
   * Predicate deciding whether a time is disabled. When supplied it is
   * authoritative and wins over `min`/`max`.
   */
  isTimeDisabled?: (time: string) => boolean;
  /** BCP-47 locale for the formatted trigger value and slot labels. */
  locale?: string;
  /** Label rendered above the trigger input. */
  label?: string;
  /** Placeholder shown on the trigger input when no time is selected. */
  placeholder?: string;
  /** Popover placement relative to the trigger. */
  placement?: Placement;
  /** Trigger input id (associates the label). */
  id?: string;
  className?: string;
}

export const TimePicker = forwardRef<HTMLDivElement, TimePickerProps>(function TimePicker(
  {
    value,
    onChange,
    step = DEFAULT_STEP_MINUTES,
    min,
    max,
    isTimeDisabled,
    locale,
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
    (next: string) => {
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

  const display = value ? formatTimeDisplay(value, locale) : "";

  const trigger = (
    <Input
      ref={inputRef}
      id={id}
      label={label}
      value={display}
      placeholder={placeholder}
      readOnly
      role="combobox"
      endIcon={<Clock size={16} />}
      aria-label={label ? undefined : "Choose time"}
    />
  );

  return (
    <div ref={ref} className={cn(styles.wrapper, className)}>
      <Popover key={closeToken} trigger={trigger} placement={placement}>
        <div role="presentation" className={styles.panel} onKeyDown={handlePanelKeyDown}>
          <TimeList
            value={value}
            onChange={handleSelect}
            step={step}
            min={min}
            max={max}
            isTimeDisabled={isTimeDisabled}
            locale={locale}
            label={label ?? "Choose time"}
          />
        </div>
      </Popover>
    </div>
  );
});

TimePicker.displayName = "TimePicker";
