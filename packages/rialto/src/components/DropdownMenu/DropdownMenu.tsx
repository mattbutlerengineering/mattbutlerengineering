import {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  cloneElement,
  type ForwardedRef,
  type ReactNode,
  type ReactElement,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { springGentle } from "../../tokens/motion";
import styles from "./DropdownMenu.module.css";

/* ── Types ───────────────────────────────────── */
/**
 * An actionable item entry within a dropdown menu.
 * Set `destructive` to visually flag dangerous actions like deletion.
 */
interface MenuItemDef {
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

/** A visual separator between groups of menu items. */
interface MenuDividerDef {
  type: "divider";
}

/** A non-interactive section heading rendered above a group of items. */
interface MenuLabelDef {
  type: "label";
  label: string;
}

/** A discriminated union of all possible entries in a dropdown menu. */
type MenuEntry = MenuItemDef | MenuDividerDef | MenuLabelDef;

/**
 * A click-triggered dropdown menu for presenting a list of actions.
 * Supports keyboard navigation (arrow keys, Home/End, Enter, Escape),
 * item icons, shortcut hints, dividers, section labels, and destructive items.
 *
 * @example
 * <DropdownMenu
 *   trigger={<Button>Actions</Button>}
 *   items={[
 *     { id: "edit", label: "Edit", onSelect: handleEdit },
 *     { type: "divider" },
 *     { id: "delete", label: "Delete", destructive: true, onSelect: handleDelete },
 *   ]}
 * />
 */
interface DropdownMenuProps {
  /** The trigger element — rendered as-is, click opens the menu */
  trigger: ReactElement;
  /** Menu entries: items, dividers, labels */
  items: MenuEntry[];
  /** Align dropdown to left (default) or right edge of trigger */
  align?: "left" | "right";
}

/* ── Helpers ─────────────────────────────────── */
function isItem(entry: MenuEntry): entry is MenuItemDef {
  return !entry.type || entry.type === "item";
}

/* ── Ref merge helper ────────────────────────── */
function mergeRefs<T>(...refs: (ForwardedRef<T> | React.RefObject<T | null>)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref && typeof ref === "object") {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    }
  };
}

/* ── Component ──────────────────────────────── */
export const DropdownMenu = forwardRef<HTMLDivElement, DropdownMenuProps>(function DropdownMenu(
  { trigger, items, align = "left" },
  ref
) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const triggerRef = useRef<Element | null>(null);
  const shouldReduceMotion = useReducedMotion();

  // Capture trigger on open; restore focus to it on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
    } else {
      requestAnimationFrame(() => {
        (triggerRef.current as HTMLElement | null)?.focus();
        triggerRef.current = null;
      });
    }
  }, [open]);

  // Flat list of focusable item indices
  const focusableIndices = items.reduce<number[]>((acc, entry, i) => {
    if (isItem(entry) && !entry.disabled) acc.push(i);
    return acc;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  // Click outside
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        close();
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  // Focus active item
  useEffect(() => {
    if (open && activeIndex >= 0) {
      itemRefs.current.get(activeIndex)?.focus();
    }
  }, [open, activeIndex]);

  function handleTriggerClick() {
    if (open) {
      close();
    } else {
      setOpen(true);
      setActiveIndex(focusableIndices[0] ?? -1);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(focusableIndices[0] ?? -1);
      }
      return;
    }

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
      case "Escape":
        e.preventDefault();
        close();
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
    <div ref={mergeRefs(ref, wrapperRef)} className={styles.wrapper}>
      {/* Trigger — ARIA attributes injected onto the trigger element itself */}
      <div
        role="presentation"
        onClick={handleTriggerClick}
        onKeyDown={(e) => {
          if (!open && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            handleTriggerClick();
          } else if (open) {
            handleKeyDown(e as unknown as React.KeyboardEvent<HTMLDivElement>);
          }
        }}
      >
        {cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
          "aria-haspopup": "menu",
          "aria-expanded": open,
        })}
      </div>

      {/* Menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            className={`${styles.menu} ${align === "right" ? styles.menuRight : ""}`}
            role="menu"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
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

              // Item
              const item = entry as MenuItemDef;
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
    </div>
  );
});

DropdownMenu.displayName = "DropdownMenu";
