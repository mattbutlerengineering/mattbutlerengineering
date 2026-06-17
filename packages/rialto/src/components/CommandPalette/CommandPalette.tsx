import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  forwardRef,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { spring, reduced } from "../../tokens/motion";
import { useReturnFocus } from "../../hooks/useReturnFocus";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./CommandPalette.module.css";

/* ── Types ───────────────────────────────────── */
/**
 * A single entry in the command palette's item list.
 * Items with the same `group` value are visually grouped under a shared header.
 *
 * @example
 * const item: CommandItem = {
 *   id: "new-file",
 *   label: "New File",
 *   group: "File",
 *   shortcut: ["Ctrl", "N"],
 *   onSelect: () => createFile(),
 * };
 */
export interface CommandItem {
  id: string;
  label: string;
  /** Optional group name — items sharing a group are shown under a header */
  group?: string;
  /** Keyboard shortcut keys, e.g. ["⌘","K"] */
  shortcut?: string[];
  /** Icon element rendered before the label */
  icon?: ReactNode;
  /** Called when the item is selected */
  onSelect?: () => void;
}

/**
 * An uncontrolled, searchable command palette driven by a declarative `CommandItem[]` array.
 * The component owns its own search state, filtering, keyboard navigation, and grouping --
 * the consumer only provides the data and responds to selection via each item's `onSelect`.
 * Globally toggleable with Cmd+K / Ctrl+K.
 *
 * @example
 * <CommandPalette
 *   open={paletteOpen}
 *   onOpenChange={setPaletteOpen}
 *   items={commands}
 *   groups={["File", "Edit", "View"]}
 * />
 */
export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
  /** Ordered list of group names — ungrouped items appear first */
  groups?: string[];
}

/* ── Search helper ───────────────────────────── */
function matchesQuery(label: string, query: string): boolean {
  const lower = label.toLowerCase();
  const q = query.toLowerCase();
  // Substring match
  if (lower.includes(q)) return true;
  // Simple initial-letter match: each query char matches the start of a word
  const words = lower.split(/\s+/);
  let wi = 0;
  for (let qi = 0; qi < q.length && wi < words.length; qi++) {
    if (words[wi]?.[0] === q[qi]) wi++;
  }
  return wi === words.length && q.length >= words.length;
}

/* ── Component ──────────────────────────────── */
export const CommandPalette = forwardRef<HTMLDivElement, CommandPaletteProps>(
  function CommandPalette(
    { open, onOpenChange, items, placeholder = "Search commands…", groups = [] },
    ref
  ) {
    const shouldReduceMotion = useReducedMotion();
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    /* ── Global ⌘K / Ctrl+K shortcut ────────── */
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          onOpenChange(!open);
        }
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open, onOpenChange]);

    /* ── Filter items ────────────────────────── */
    const filtered = useMemo(() => {
      if (!query.trim()) return items;
      return items.filter((item) => matchesQuery(item.label, query));
    }, [items, query]);

    /* ── Group items ─────────────────────────── */
    const grouped = useMemo(() => {
      const map = new Map<string, CommandItem[]>();
      const ungrouped: CommandItem[] = [];

      for (const item of filtered) {
        if (item.group) {
          const arr = map.get(item.group) ?? [];
          arr.push(item);
          map.set(item.group, arr);
        } else {
          ungrouped.push(item);
        }
      }

      const result: { group: string | null; items: CommandItem[] }[] = [];
      if (ungrouped.length) result.push({ group: null, items: ungrouped });

      const orderedGroups = groups.length ? groups : Array.from(map.keys());

      for (const g of orderedGroups) {
        const arr = map.get(g);
        if (arr?.length) result.push({ group: g, items: arr });
      }

      return result;
    }, [filtered, groups]);

    /* ── Flat list for keyboard nav ──────────── */
    const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

    /* ── Capture trigger on open; restore focus on close ── */
    useReturnFocus(open);

    /* ── Reset on open/close ─────────────────── */
    useEffect(() => {
      if (open) {
        setQuery("");
        setActiveIndex(0);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }, [open]);

    /* ── Focus trap inside panel when open ───── */
    useFocusTrap(panelRef, open);

    /* ── Clamp active index when results change  */
    useEffect(() => {
      setActiveIndex((prev) => Math.min(prev, Math.max(0, flatItems.length - 1)));
    }, [flatItems.length]);

    /* ── Scroll active item into view ────────── */
    useEffect(() => {
      const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    /* ── Select handler ──────────────────────── */
    const selectItem = useCallback(
      (item: CommandItem) => {
        onOpenChange(false);
        item.onSelect?.();
      },
      [onOpenChange]
    );

    /* ── Keyboard nav ────────────────────────── */
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % flatItems.length);
            break;
          case "ArrowUp":
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
            break;
          case "Home":
            e.preventDefault();
            setActiveIndex(0);
            break;
          case "End":
            e.preventDefault();
            setActiveIndex(flatItems.length - 1);
            break;
          case "Enter":
            e.preventDefault();
            if (flatItems[activeIndex]) selectItem(flatItems[activeIndex]);
            break;
          case "Escape":
            e.preventDefault();
            onOpenChange(false);
            break;
        }
      },
      [flatItems, activeIndex, selectItem, onOpenChange]
    );

    /* ── Render ──────────────────────────────── */
    let itemCounter = 0;

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? reduced : { duration: 0.15 }}
            onClick={() => onOpenChange(false)}
            onKeyDown={handleKeyDown}
          >
            <motion.div
              ref={panelRef}
              className={styles.panel}
              role="dialog"
              aria-label="Command palette"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
              transition={shouldReduceMotion ? reduced : spring}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search */}
              <div className={styles.searchWrap}>
                <svg className={styles.searchIcon} viewBox="0 0 18 18" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" />
                  <line x1="12" y1="12" x2="16" y2="16" />
                </svg>
                <input
                  ref={inputRef}
                  className={styles.searchInput}
                  type="text"
                  role="combobox"
                  aria-label="Search commands"
                  aria-expanded={true}
                  aria-controls="cmd-palette-listbox"
                  aria-activedescendant={
                    flatItems[activeIndex] ? `cmd-item-${flatItems[activeIndex].id}` : undefined
                  }
                  placeholder={placeholder}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Results */}
              <div
                className={styles.results}
                ref={listRef}
                id="cmd-palette-listbox"
                role="listbox"
                aria-label="Command results"
              >
                {flatItems.length === 0 ? (
                  <div className={styles.empty}>
                    <svg className={styles.emptyIcon} viewBox="0 0 32 32" aria-hidden="true">
                      <circle cx="14" cy="14" r="9" />
                      <line x1="20.5" y1="20.5" x2="28" y2="28" />
                      <line x1="11" y1="14" x2="17" y2="14" />
                    </svg>
                    <span className={styles.emptyText}>No results found</span>
                  </div>
                ) : (
                  grouped.map((section) => {
                    const sectionItems = section.items.map((item) => {
                      const index = itemCounter++;
                      return (
                        <div
                          key={item.id}
                          id={`cmd-item-${item.id}`}
                          className={styles.item}
                          role="option"
                          tabIndex={-1}
                          data-index={index}
                          data-active={index === activeIndex}
                          aria-selected={index === activeIndex}
                          onClick={() => selectItem(item)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              selectItem(item);
                            }
                          }}
                          onPointerMove={() => setActiveIndex(index)}
                        >
                          {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                          <span className={styles.itemLabel}>{item.label}</span>
                          {item.shortcut && (
                            <span className={styles.itemShortcut}>
                              {item.shortcut.map((k, i) => (
                                <kbd key={i}>{k}</kbd>
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    });

                    return (
                      <div key={section.group ?? "__ungrouped"}>
                        {section.group && <div className={styles.groupLabel}>{section.group}</div>}
                        {sectionItems}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer hints */}
              <div className={styles.footer}>
                <span className={styles.footerHint}>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> navigate
                </span>
                <span className={styles.footerHint}>
                  <kbd>↵</kbd> select
                </span>
                <span className={styles.footerHint}>
                  <kbd>esc</kbd> close
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

CommandPalette.displayName = "CommandPalette";
