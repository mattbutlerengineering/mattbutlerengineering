import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "../../utils/class-composer";
import {
  buildTimeSlots,
  formatTimeDisplay,
  isTimeSlotDisabled,
  type TimeBounds,
} from "./time-grid";
import styles from "./TimePicker.module.css";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface TimeListProps extends TimeBounds {
  /** Currently selected time as an `HH:mm` string, or `null` when empty. */
  value: string | null;
  /** Called with the newly selected time (`HH:mm`). */
  onChange: (value: string) => void;
  /** Interval between slots, in minutes. */
  step: number;
  /** BCP-47 locale for the display label of each slot. */
  locale?: string;
  /** Accessible name for the listbox. */
  label: string;
}

/** Next non-disabled index moving in `dir` from `from`; keeps `from` when none. */
function nextEnabled(disabled: boolean[], from: number, dir: 1 | -1): number {
  let i = from + dir;
  while (i >= 0 && i < disabled.length) {
    if (!disabled[i]) return i;
    i += dir;
  }
  return from >= 0 && from < disabled.length && !disabled[from] ? from : firstEnabled(disabled);
}

/** First non-disabled index, or 0 when every slot is disabled. */
function firstEnabled(disabled: boolean[]): number {
  const i = disabled.findIndex((d) => !d);
  return i === -1 ? 0 : i;
}

/* ── Component ─────────────────────────────────────────────────────────── */

/**
 * The listbox rendered inside the TimePicker popover: a roving-tabindex list of
 * interval slots (the ARIA APG listbox pattern). Owns its own active-slot state
 * and moves DOM focus only after a keyboard navigation (a mount-guarded ref
 * flag, never `requestAnimationFrame` which testing-library does not await).
 *
 * Options are `<div role="option">`, not `<button>`, on purpose: only the active
 * option carries `tabIndex={0}`, so the Popover's "focus the first focusable"
 * open behaviour targets the same element the roving focus does — a `<button>`
 * would be matched by the Popover's `button` selector and steal focus to slot 0.
 * The keydown handler lives on each option (not the container) so it fires once.
 * Escape is left to bubble to the panel.
 */
export function TimeList({
  value,
  onChange,
  step,
  min,
  max,
  isTimeDisabled,
  locale,
  label,
}: TimeListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef(false);

  // Slots + display labels are stable for a given step/locale — build once.
  const slots = useMemo(
    () => buildTimeSlots(step).map((time) => ({ time, label: formatTimeDisplay(time, locale) })),
    [step, locale]
  );
  const disabled = useMemo(
    () => slots.map((slot) => isTimeSlotDisabled(slot.time, { min, max, isTimeDisabled })),
    [slots, min, max, isTimeDisabled]
  );

  // The active (roving-focus) slot: the selected slot if enabled, else the
  // first enabled slot. Derived once at mount — the list remounts on each open.
  const [activeIndex, setActiveIndex] = useState(() => {
    const selected = slots.findIndex((slot) => slot.time === value);
    return selected >= 0 && !disabled[selected] ? selected : firstEnabled(disabled);
  });

  // Keep the active slot in view; move DOM focus onto it only after a keyboard
  // navigation (DOM-only side effects — no state is set here).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!el) return;
    // scrollIntoView is unimplemented in jsdom — guard so tests don't throw.
    el.scrollIntoView?.({ block: "nearest" });
    if (pendingFocusRef.current) {
      pendingFocusRef.current = false;
      el.focus();
    }
  }, [activeIndex]);

  const moveActive = useCallback((next: number) => {
    pendingFocusRef.current = true;
    setActiveIndex(next);
  }, []);

  // The focused option is always the active one, so a single handler keyed off
  // `activeIndex` serves every option. Arrows/Home/End rove; Enter/Space select;
  // everything else (Escape) bubbles to the panel.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = nextEnabled(disabled, activeIndex, 1);
        break;
      case "ArrowUp":
        next = nextEnabled(disabled, activeIndex, -1);
        break;
      case "Home":
        next = firstEnabled(disabled);
        break;
      case "End":
        next = nextEnabled(disabled, disabled.length, -1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const slot = slots[activeIndex];
        if (slot && !disabled[activeIndex]) onChange(slot.time);
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    moveActive(next);
  };

  return (
    <div ref={listRef} role="listbox" tabIndex={-1} aria-label={label} className={styles.list}>
      {slots.map((slot, index) => {
        const selected = slot.time === value;
        const isDisabled = disabled[index];
        return (
          <div
            key={slot.time}
            role="option"
            data-time={slot.time}
            data-index={index}
            aria-selected={selected}
            aria-disabled={isDisabled || undefined}
            data-selected={selected || undefined}
            data-active={activeIndex === index || undefined}
            data-disabled={isDisabled || undefined}
            tabIndex={activeIndex === index ? 0 : -1}
            className={cn(styles.option, selected && styles.optionSelected)}
            onClick={isDisabled ? undefined : () => onChange(slot.time)}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => !isDisabled && setActiveIndex(index)}
          >
            <Check className={styles.check} size={14} aria-hidden="true" />
            {slot.label}
          </div>
        );
      })}
    </div>
  );
}
