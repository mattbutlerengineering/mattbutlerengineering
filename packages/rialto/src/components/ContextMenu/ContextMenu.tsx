import {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  type ReactNode,
  type ReactElement,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { springGentle } from "../../tokens/motion";
import styles from "./ContextMenu.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * An actionable item entry within a context menu.
 * Set `destructive` to visually flag dangerous actions like deletion.
 */
export interface ContextMenuItemDef {
  type?: "item";
  id: string;
  label: string;
  icon?: ReactNode;
  /** Keyboard shortcut hint displayed on the right side of the item */
  shortcut?: string;
  disabled?: boolean;
  /** Renders the item in a warning/error style to flag dangerous actions */
  destructive?: boolean;
  onSelect?: () => void;
}

/** A visual separator between groups of context menu items. */
export interface ContextMenuDividerDef {
  type: "divider";
}

/** A non-interactive section heading rendered above a group of context menu items. */
export interface ContextMenuLabelDef {
  type: "label";
  label: string;
}

/** A discriminated union of all possible entries in a context menu. */
export type ContextMenuEntry = ContextMenuItemDef | ContextMenuDividerDef | ContextMenuLabelDef;

/**
 * A right-click context menu that appears at the pointer position.
 * Wrap any element with ContextMenu to intercept its `contextmenu` event.
 * Automatically adjusts position to stay within viewport boundaries.
 *
 * @example
 * <ContextMenu items={[
 *   { id: "copy", label: "Copy", shortcut: "Ctrl+C", onSelect: handleCopy },
 *   { type: "divider" },
 *   { id: "delete", label: "Delete", destructive: true, onSelect: handleDelete },
 * ]}>
 *   <div>Right-click this area</div>
 * </ContextMenu>
 */
export interface ContextMenuProps {
  items: ContextMenuEntry[];
  /** The element whose right-click event triggers the menu */
  children: ReactElement;
}

/* ── Helpers ─────────────────────────────────── */

function isItem(entry: ContextMenuEntry): entry is ContextMenuItemDef {
  return !entry.type || entry.type === "item";
}

/* ── Component ──────────────────────────────── */

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu(
  { items, children },
  ref
) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [activeIndex, setActiveIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const shouldReduceMotion = useReducedMotion();

  const focusableIndices = items.reduce<number[]>((acc, entry, i) => {
    if (isItem(entry) && !entry.disabled) acc.push(i);
    return acc;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // Viewport boundary detection
      const menuWidth = 200;
      const menuHeight = items.length * 36;
      const x = e.clientX + menuWidth > window.innerWidth ? e.clientX - menuWidth : e.clientX;
      const y = e.clientY + menuHeight > window.innerHeight ? e.clientY - menuHeight : e.clientY;

      setPosition({ x, y });
      setOpen(true);
      setActiveIndex(focusableIndices[0] ?? -1);
    },
    [items.length, focusableIndices]
  );

  // Click outside / Escape
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, close]);

  // Focus active item
  useEffect(() => {
    if (open && activeIndex >= 0) {
      itemRefs.current.get(activeIndex)?.focus();
    }
  }, [open, activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    const currentPos = focusableIndices.indexOf(activeIndex);

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const next = currentPos < focusableIndices.length - 1 ? currentPos + 1 : 0;
        setActiveIndex(focusableIndices[next]!);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = currentPos > 0 ? currentPos - 1 : focusableIndices.length - 1;
        setActiveIndex(focusableIndices[prev]!);
        break;
      }
      case "Home":
        e.preventDefault();
        setActiveIndex(focusableIndices[0]!);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(focusableIndices[focusableIndices.length - 1]!);
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const entry = items[activeIndex];
        if (entry && isItem(entry) && !entry.disabled) {
          entry.onSelect?.();
          close();
        }
        break;
      }
    }
  }

  return (
    <>
      <div ref={ref} onContextMenu={handleContextMenu} style={{ display: "contents" }}>
        {children}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            className={styles.menu}
            role="menu"
            style={{ left: position.x, top: position.y }}
            onKeyDown={handleKeyDown}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={shouldReduceMotion ? { duration: 0.1 } : springGentle}
          >
            {items.map((entry, i) => {
              if (entry.type === "divider") {
                return <div key={`div-${i}`} className={styles.divider} role="separator" />;
              }

              if (entry.type === "label") {
                return (
                  <div key={`label-${i}`} className={styles.label} role="presentation">
                    {entry.label}
                  </div>
                );
              }

              const item = entry as ContextMenuItemDef;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(i, el);
                    else itemRefs.current.delete(i);
                  }}
                  className={`${styles.item} ${item.destructive ? styles.destructive : ""}`}
                  role="menuitem"
                  disabled={item.disabled}
                  data-active={activeIndex === i}
                  tabIndex={-1}
                  onClick={() => {
                    if (!item.disabled) {
                      item.onSelect?.();
                      close();
                    }
                  }}
                  onMouseEnter={() => {
                    if (!item.disabled) setActiveIndex(i);
                  }}
                >
                  {item.icon && <span className={styles.icon}>{item.icon}</span>}
                  {item.label}
                  {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

ContextMenu.displayName = "ContextMenu";
