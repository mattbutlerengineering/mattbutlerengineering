import { useCallback, useEffect, useRef, useState } from "react";
import type { TimeSlot } from "@mbe/types";
import { Button } from "@mattbutlerengineering/rialto";
import { formatTime } from "../../utils/format.js";
import styles from "./TimeSlotPicker.module.css";

export interface TimeSlotListboxProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  onSelectSlot: (slot: TimeSlot) => void;
  /** Accessible name for this period's listbox, e.g. "Available dinner times". */
  label: string;
}

/** Clamp `index` to a valid slot index (never below 0 or past the last slot). */
function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length - 1);
}

/**
 * One meal-period's time slots as an ARIA APG roving-tabindex listbox — same
 * pattern as rialto's TimeList (packages/rialto/src/components/TimePicker/TimeList.tsx):
 * only the active option is a Tab stop, Up/Down/Home/End move it, Enter/Space
 * selects. Each period group gets its own instance so roving is scoped within
 * that group, not across the whole picker.
 */
export function TimeSlotListbox({
  slots,
  selectedSlot,
  onSelectSlot,
  label,
}: TimeSlotListboxProps) {
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const pendingFocusRef = useRef(false);

  const [activeIndex, setActiveIndex] = useState(() => {
    const selected = slots.findIndex((slot) => slot.time === selectedSlot?.time);
    return selected >= 0 ? selected : 0;
  });

  // Move DOM focus onto the active option only after a keyboard navigation.
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    itemRefs.current.get(activeIndex)?.focus();
  }, [activeIndex]);

  const moveActive = useCallback((next: number) => {
    pendingFocusRef.current = true;
    setActiveIndex(next);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = clampIndex(activeIndex + 1, slots.length);
        break;
      case "ArrowUp":
        next = clampIndex(activeIndex - 1, slots.length);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = slots.length - 1;
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const slot = slots[activeIndex];
        if (slot) onSelectSlot(slot);
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    moveActive(next);
  };

  return (
    <div className={styles.slotGrid} role="listbox" aria-label={label}>
      {slots.map((slot, index) => (
        <Button
          key={slot.time}
          ref={(el) => {
            if (el) itemRefs.current.set(index, el);
            else itemRefs.current.delete(index);
          }}
          role="option"
          aria-selected={selectedSlot?.time === slot.time}
          tabIndex={activeIndex === index ? 0 : -1}
          onClick={() => {
            setActiveIndex(index);
            onSelectSlot(slot);
          }}
          onKeyDown={handleKeyDown}
          className={[
            styles.slot,
            selectedSlot?.time === slot.time ? styles.slotSelected : "",
          ].join(" ")}
        >
          {formatTime(slot.time)}
        </Button>
      ))}
    </div>
  );
}
