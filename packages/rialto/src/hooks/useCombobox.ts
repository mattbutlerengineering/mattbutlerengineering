import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type RefObject,
} from "react";

/**
 * A single item in the combobox listbox. `value` is the stable identity,
 * `label` is matched by type-ahead, and `disabled` items are skipped by
 * navigation and are not selectable.
 */
export interface ComboboxItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface UseComboboxOptions {
  items: ComboboxItem[];
  /** Currently selected value — drives the initial focused index on open. */
  value?: string;
  /** Invoked when an item is committed (click, Enter, or closed type-ahead). */
  onSelect?: (value: string) => void;
  /** Wrapper element used to detect outside mousedown. */
  containerRef?: RefObject<HTMLElement | null>;
  /** Called after close/select so the consumer can return focus to its trigger. */
  onRequestTriggerFocus?: () => void;
}

export interface UseComboboxResult {
  readonly open: boolean;
  readonly focusedIndex: number;
  /** Open the listbox, focusing the selected value (or the first item). */
  readonly openWithFocus: () => void;
  readonly close: () => void;
  readonly toggle: () => void;
  /** Commit a value: fires onSelect, closes, and requests trigger focus. */
  readonly select: (value: string) => void;
  readonly setFocusedIndex: (index: number) => void;
  readonly handleKeyDown: (e: KeyboardEvent) => void;
}

const TYPEAHEAD_RESET_MS = 500;

/**
 * Listbox state machine shared by combobox-style widgets (Select, Autocomplete).
 *
 * Owns: open/close state, focused-item index, ArrowUp/ArrowDown navigation with
 * disabled-item skipping, Home/End, printable-character type-ahead with a
 * timeout reset, click-outside via a document `mousedown` listener, and
 * Escape/Tab close. Rendering and ARIA wiring stay with the consumer.
 *
 * Follows the rialto rule of never calling setState in a `useEffect` body:
 * state transitions happen in event handlers, and the click-outside effect only
 * (de)registers a listener.
 */
export function useCombobox({
  items,
  value,
  onSelect,
  containerRef,
  onRequestTriggerFocus,
}: UseComboboxOptions): UseComboboxResult {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const close = useCallback(() => setOpen(false), []);

  const openWithFocus = useCallback(() => {
    const idx = value ? items.findIndex((o) => o.value === value) : 0;
    setFocusedIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [value, items]);

  const toggle = useCallback(() => {
    if (open) {
      setOpen(false);
    } else {
      openWithFocus();
    }
  }, [open, openWithFocus]);

  const select = useCallback(
    (optionValue: string) => {
      onSelect?.(optionValue);
      setOpen(false);
      onRequestTriggerFocus?.();
    },
    [onSelect, onRequestTriggerFocus]
  );

  // Type-ahead: match item labels by typed characters.
  const handleTypeahead = useCallback(
    (char: string) => {
      clearTimeout(typeaheadTimerRef.current);
      typeaheadRef.current += char.toLowerCase();
      typeaheadTimerRef.current = setTimeout(() => (typeaheadRef.current = ""), TYPEAHEAD_RESET_MS);

      const query = typeaheadRef.current;
      const startIndex = open ? focusedIndex + 1 : 0;

      // Search from current position, then wrap around.
      for (let i = 0; i < items.length; i++) {
        const idx = (startIndex + i) % items.length;
        const opt = items[idx];
        if (opt && !opt.disabled && opt.label.toLowerCase().startsWith(query)) {
          if (open) {
            setFocusedIndex(idx);
          } else {
            // When closed, type-ahead selects directly.
            select(opt.value);
          }
          return;
        }
      }
    },
    [open, focusedIndex, items, select]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Type-ahead for printable single characters.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleTypeahead(e.key);
        if (!open) openWithFocus();
        return;
      }

      if (!open) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openWithFocus();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex((prev) => {
            let next = prev + 1;
            while (next < items.length && items[next]?.disabled) next++;
            return next < items.length ? next : prev;
          });
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => {
            let next = prev - 1;
            while (next >= 0 && items[next]?.disabled) next--;
            return next >= 0 ? next : prev;
          });
          break;
        }
        case "Home": {
          e.preventDefault();
          const first = items.findIndex((o) => !o.disabled);
          if (first >= 0) setFocusedIndex(first);
          break;
        }
        case "End": {
          e.preventDefault();
          for (let i = items.length - 1; i >= 0; i--) {
            if (!items[i]?.disabled) {
              setFocusedIndex(i);
              break;
            }
          }
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          const focused = items[focusedIndex];
          if (focused && !focused.disabled) {
            select(focused.value);
          }
          break;
        }
        case "Tab":
          setOpen(false);
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          onRequestTriggerFocus?.();
          break;
      }
    },
    [open, focusedIndex, items, handleTypeahead, openWithFocus, select, onRequestTriggerFocus]
  );

  // Close on outside mousedown. Effect only (de)registers the listener — the
  // setState happens inside the event handler, never in the effect body.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const wrapper = containerRef?.current;
      if (wrapper && !wrapper.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, containerRef]);

  // Clean up the type-ahead timer on unmount.
  useEffect(() => {
    const timer = typeaheadTimerRef;
    return () => clearTimeout(timer.current);
  }, []);

  return {
    open,
    focusedIndex,
    openWithFocus,
    close,
    toggle,
    select,
    setFocusedIndex,
    handleKeyDown,
  };
}
