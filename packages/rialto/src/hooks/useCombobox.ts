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
  /**
   * Additional element(s) also treated as "inside" for outside-press
   * detection — e.g. a listbox portaled outside `containerRef`'s DOM
   * subtree (see rialto `Select`, which portals its dropdown to
   * `document.body` to escape an ancestor's stacking context).
   */
  extraContainerRefs?: RefObject<HTMLElement | null>[];
  /** Called after close/select so the consumer can return focus to its trigger. */
  onRequestTriggerFocus?: () => void;
  /**
   * `"button"` (default): a button-style trigger — opens with the selected item
   * focused, Space/Enter open and commit, printable keys type-ahead.
   * `"input"`: a text input owns typing — opens with nothing focused (ARIA APG:
   * `aria-activedescendant` is set only once the user arrows; ArrowDown/ArrowUp
   * on a closed list open it on the first/last enabled item), Space and
   * printable keys are left to the input, and Enter on a focused item commits it
   * like a click. Callers that must stay open after a commit (multi-select) handle
   * Enter themselves before delegating the remaining keys.
   */
  inputMode?: "button" | "input";
  /** Input mode: ArrowDown/ArrowUp wrap around the ends instead of clamping. */
  wrap?: boolean;
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
 * Next enabled index moving `dir` from `from`. Without `wrap`, stays on `from`
 * (clamped to a valid index, else -1) when nothing enabled lies ahead; with
 * `wrap`, continues from the opposite end.
 */
function nextEnabledIndex(items: ComboboxItem[], from: number, dir: 1 | -1, wrap: boolean): number {
  const n = items.length;
  for (let step = 1; step <= n; step++) {
    const raw = from + dir * step;
    if (!wrap && (raw < 0 || raw >= n)) break;
    const i = ((raw % n) + n) % n;
    if (!items[i]?.disabled) return i;
  }
  return from >= 0 && from < n ? from : -1;
}

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
  extraContainerRefs,
  onRequestTriggerFocus,
  inputMode = "button",
  wrap = false,
}: UseComboboxOptions): UseComboboxResult {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const close = useCallback(() => setOpen(false), []);

  const isInput = inputMode === "input";

  const openWithFocus = useCallback(() => {
    if (isInput) {
      setFocusedIndex(-1);
      setOpen(true);
      return;
    }
    const idx = value ? items.findIndex((o) => o.value === value) : 0;
    setFocusedIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [value, items, isInput]);

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

  // Input mode: only Up/Down, Enter, Escape and Tab; text keys belong to the input.
  const handleInputKey = useCallback(
    (e: KeyboardEvent) => {
      if (!open) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          // ARIA APG: Down opens on the first enabled item, Up on the last.
          e.preventDefault();
          setOpen(true);
          setFocusedIndex(
            e.key === "ArrowDown"
              ? nextEnabledIndex(items, -1, 1, false)
              : nextEnabledIndex(items, items.length, -1, false)
          );
        }
        return;
      }
      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp": {
          e.preventDefault();
          const dir = e.key === "ArrowDown" ? 1 : -1;
          setFocusedIndex(nextEnabledIndex(items, focusedIndex, dir, wrap));
          break;
        }
        case "Enter": {
          e.preventDefault();
          const focused = focusedIndex >= 0 ? items[focusedIndex] : undefined;
          if (focused && !focused.disabled) select(focused.value);
          break;
        }
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
        case "Tab":
          setOpen(false);
          break;
      }
    },
    [open, items, focusedIndex, wrap, select]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isInput) {
        handleInputKey(e);
        return;
      }
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
    [
      isInput,
      handleInputKey,
      open,
      focusedIndex,
      items,
      handleTypeahead,
      openWithFocus,
      select,
      onRequestTriggerFocus,
    ]
  );

  // Close on outside mousedown. Effect only (de)registers the listener — the
  // setState happens inside the event handler, never in the effect body.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const wrapper = containerRef?.current;
      if (!wrapper || wrapper.contains(target)) return;
      const insideExtra = extraContainerRefs?.some((r) => r.current?.contains(target));
      if (!insideExtra) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, containerRef, extraContainerRefs]);

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
