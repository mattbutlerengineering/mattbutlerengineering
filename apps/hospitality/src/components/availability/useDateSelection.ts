import { useEffect, useRef, type MouseEvent, type TouchEvent } from "react";
import { dateRange, normalizeDates, toggleDate } from "./selection.js";

/** How long a finger must rest on a day before it starts a selection. */
const LONG_PRESS_MS = 500;

export interface DateSelectionOptions {
  readonly selection: readonly string[];
  readonly onSelectionChange: (dates: string[]) => void;
  readonly onOpenDay: (date: string) => void;
}

export interface DateGestureHandlers {
  readonly onClick: (event: MouseEvent) => void;
  readonly onMouseDown: (event: MouseEvent) => void;
  readonly onMouseEnter: () => void;
  readonly onTouchStart: () => void;
  readonly onTouchMove: () => void;
  readonly onTouchEnd: (event: TouchEvent) => void;
  readonly onContextMenu: (event: MouseEvent) => void;
}

/**
 * The pointer gestures that build a multi-day selection (ux.md F-MS): click-drag a range,
 * Shift-click to extend, Ctrl/Cmd-click to add or remove, long-press on touch and then tap
 * more. A plain click is still "open this day"; the opener decides when that drops the selection.
 */
export function useDateSelection(options: DateSelectionOptions) {
  const { selection, onSelectionChange, onOpenDay } = options;
  const pivot = useRef<string | null>(null);
  const drag = useRef<{ from: string; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const touchMode = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);

  useEffect(() => {
    const endDrag = () => {
      if (drag.current?.moved) {
        // The click that follows a drag's mouseup fires synchronously; clear the flag after it.
        suppressClick.current = true;
        setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      drag.current = null;
    };
    window.addEventListener("mouseup", endDrag);
    return () => window.removeEventListener("mouseup", endDrag);
  }, []);

  const clearTimer = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  /** Select from `from` through `to`, keeping `from` as the pivot (Shift+Arrow, drag). */
  const extendSelection = (from: string, to: string) => {
    pivot.current = from;
    onSelectionChange(dateRange(from, to));
  };

  /** Add or remove one day, and make it the pivot a later Shift-click or Shift+Arrow grows from. */
  const toggleSelected = (date: string) => {
    pivot.current = date;
    onSelectionChange(toggleDate(selection, date));
  };

  const handlersFor = (date: string): DateGestureHandlers => ({
    onMouseDown: (event) => {
      if (event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        drag.current = { from: date, moved: false };
      }
    },
    onMouseEnter: () => {
      const d = drag.current;
      if (!d || (date === d.from && !d.moved)) return;
      d.moved = true;
      extendSelection(d.from, date);
    },
    onClick: (event) => {
      if (suppressClick.current) return;
      if (event.shiftKey) {
        onSelectionChange(dateRange(pivot.current ?? date, date));
      } else if (event.ctrlKey || event.metaKey || (touchMode.current && selection.length > 0)) {
        toggleSelected(date);
      } else {
        pivot.current = date;
        touchMode.current = false;
        onOpenDay(date);
      }
    },
    onTouchStart: () => {
      pressed.current = false;
      clearTimer();
      pressTimer.current = setTimeout(() => {
        pressed.current = true;
        touchMode.current = true;
        pivot.current = date;
        onSelectionChange(normalizeDates([...selection, date]));
      }, LONG_PRESS_MS);
    },
    onTouchMove: clearTimer,
    onTouchEnd: (event) => {
      clearTimer();
      // Swallow the click the browser synthesises after a long-press.
      if (pressed.current) event.preventDefault();
      pressed.current = false;
    },
    onContextMenu: (event) => {
      if (pressTimer.current || pressed.current) event.preventDefault();
    },
  });

  return { handlersFor, extendSelection, toggleSelected, pivot };
}
