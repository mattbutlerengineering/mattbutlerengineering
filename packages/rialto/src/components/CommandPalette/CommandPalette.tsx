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
import { useEscapeKey } from "../../hooks/useEscapeKey";
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
  /**
   * Ordered list of group names — ungrouped items appear first. With a query,
   * groups reorder by the strongest match they contain (see `rankCommandMatch`);
   * this order only breaks ties.
   */
  groups?: string[];
}

/* ── Search helper ───────────────────────────── */
/** How well a label matches a query — lower is stronger. */
export type CommandMatchRank = 0 | 1 | 2 | 3;

/**
 * Ranks `label` against a non-empty `query`, case-insensitively:
 * - `0` — the label starts with the query
 * - `1` — a later word starts with the query
 * - `2` — the query appears anywhere in the label
 * - `3` — strict initials: every query character opens the next word, so the
 *   query can be no longer than the label has words
 * - `null` — no match
 *
 * Words split on whitespace: `"wg"` ranks `"Walk-in guest"` at 3, while
 * `"walk"` does not match `"Waitlist"` at all.
 */
export function rankCommandMatch(label: string, query: string): CommandMatchRank | null {
  const lower = label.toLowerCase();
  const q = query.toLowerCase();
  if (lower.startsWith(q)) return 0;
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.slice(1).some((word) => word.startsWith(q))) return 1;
  if (lower.includes(q)) return 2;
  const opensEachWord =
    q.length <= words.length && Array.from(q).every((ch, i) => words[i]?.startsWith(ch));
  return opensEachWord ? 3 : null;
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

    /* ── Filter + rank items ─────────────────── */
    const trimmedQuery = query.trim();
    const ranked = useMemo(() => {
      if (!trimmedQuery) return items.map((item) => ({ item, rank: 0 as CommandMatchRank }));
      return (
        items
          .flatMap((item) => {
            const rank = rankCommandMatch(item.label, trimmedQuery);
            return rank === null ? [] : [{ item, rank }];
          })
          // Array.prototype.sort is stable: equal ranks keep `items` order.
          .sort((a, b) => a.rank - b.rank)
      );
    }, [items, trimmedQuery]);

    /* ── Group items ─────────────────────────── */
    const grouped = useMemo(() => {
      type Section = { group: string | null; items: CommandItem[]; best: CommandMatchRank };
      const sections = new Map<string | null, Section>();

      // `ranked` is rank-ordered, so the first item seen for a section carries its best rank.
      for (const { item, rank } of ranked) {
        const key = item.group ?? null;
        const section = sections.get(key);
        if (section) section.items.push(item);
        else sections.set(key, { group: key, items: [item], best: rank });
      }

      const groupOrder = groups.length
        ? groups
        : Array.from(sections.keys()).filter((key): key is string => key !== null);

      const result = [null, ...groupOrder].flatMap((key) => {
        const section = sections.get(key);
        return section ? [section] : [];
      });

      // With a query, the section holding the strongest match leads; ties keep the order above.
      if (trimmedQuery) result.sort((a, b) => a.best - b.best);

      return result.map(({ group, items: sectionItems }) => ({ group, items: sectionItems }));
    }, [ranked, groups, trimmedQuery]);

    /* ── Flat list for keyboard nav ──────────── */
    const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

    /* ── Capture trigger on open; restore focus on close ── */
    useReturnFocus(open);
    useEscapeKey(() => onOpenChange(false), open);

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
              aria-modal="true"
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
