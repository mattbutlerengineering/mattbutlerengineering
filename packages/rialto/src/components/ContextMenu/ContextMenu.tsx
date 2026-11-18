import {
  useState,
  useRef,
  useCallback,
  useId,
  useLayoutEffect,
  forwardRef,
  cloneElement,
  isValidElement,
  Fragment,
  type ReactNode,
  type ReactElement,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { useReturnFocus } from "../../hooks/useReturnFocus";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useDismiss } from "../../hooks/useDismiss";
import { usePointerActivation } from "../../hooks/usePointerActivation";
import { cn } from "../../utils/class-composer";
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
 * A context menu that opens at the pointer on right-click, or on the focused
 * target with Shift+F10 or the Context Menu key. A target that is not already
 * focusable is placed in the tab order. The child must forward `tabIndex`,
 * `onKeyDown`, `onContextMenu`, and `className` (DOM nodes and Card do).
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

const NATIVE_FOCUSABLE = new Set(["button", "input", "select", "textarea", "summary"]);

const POPUP_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "tab",
  "combobox",
  "gridcell",
  "treeitem",
]);

type TriggerProps = {
  className?: string;
  href?: unknown;
  tabIndex?: unknown;
  role?: unknown;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
};

/** Shift+F10 and the Context Menu key are the APG open chords for a context menu. */
function isContextMenuKey(event: { key: string; code?: string; shiftKey: boolean }): boolean {
  return (
    event.key === "ContextMenu" ||
    event.code === "ContextMenu" ||
    (event.shiftKey && event.key === "F10")
  );
}

/**
 * DOM nodes that are already in the tab order keep their own tab stop.
 * Anything else (a div, a Card) needs tabindex=0 or keyboard users cannot reach it.
 * An explicit tabIndex, including -1, is left alone.
 */
function shouldInjectTabIndex(child: ReactElement): boolean {
  if (!isValidElement(child) || child.type === Fragment) return false;
  const props = child.props as TriggerProps;
  if (props.tabIndex != null) return false;
  if (typeof child.type !== "string") return true;
  if (child.type === "a") return !(typeof props.href === "string" && props.href.length > 0);
  return !NATIVE_FOCUSABLE.has(child.type);
}

/** aria-haspopup / aria-expanded are not allowed on a generic element. */
function supportsPopupAttrs(child: ReactElement): boolean {
  const props = child.props as TriggerProps;
  if (typeof props.role === "string") return POPUP_ROLES.has(props.role);
  if (child.type === "a") return typeof props.href === "string" && props.href.length > 0;
  return typeof child.type === "string" && NATIVE_FOCUSABLE.has(child.type);
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
  // Set when Shift+F10 / ContextMenu just opened the menu, so the contextmenu
  // event some browsers fire next does not jump the menu to 0,0. A real
  // right-click (button 2) always wins, so a stuck flag cannot swallow it.
  const keyboardOpenRef = useRef(false);
  const motionPreset = useMotionPreset();
  const shouldReduceMotion = motionPreset.reduced;
  const menuId = useId();

  const skipReturnFocus = useReturnFocus(open);

  const focusableIndices = items.reduce<number[]>((acc, entry, i) => {
    if (isItem(entry) && !entry.disabled) acc.push(i);
    return acc;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEscapeKey(close, open);

  const openAtPoint = useCallback(
    (x: number, y: number) => {
      // Viewport boundary detection — same clamp the pointer path has always used.
      const menuWidth = 200;
      const menuHeight = items.length * 36;
      const nextX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
      const nextY = y + menuHeight > window.innerHeight ? y - menuHeight : y;
      setPosition({ x: nextX, y: nextY });
      setOpen(true);
      setActiveIndex(focusableIndices[0] ?? -1);
    },
    [items.length, focusableIndices]
  );

  const handleContextMenu = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      const keyboardFollowUp = keyboardOpenRef.current && e.button !== 2;
      keyboardOpenRef.current = false;
      if (keyboardFollowUp) return;
      openAtPoint(e.clientX, e.clientY);
    },
    [openAtPoint]
  );

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented || event.repeat || !isContextMenuKey(event)) return;
      event.preventDefault();
      keyboardOpenRef.current = true;
      const rect = event.currentTarget.getBoundingClientRect();
      openAtPoint(rect.left, rect.top);
      queueMicrotask(() => {
        keyboardOpenRef.current = false;
      });
    },
    [openAtPoint]
  );

  useDismiss(menuRef, close, { enabled: open });
  const { hasPointerMoved, resetPointerMovement } = usePointerActivation(open);

  // Focus the active item before paint. useReturnFocus captures the trigger in
  // its own layout effect, which is declared first, so this move happens after
  // that capture and Escape still restores the target.
  useLayoutEffect(() => {
    if (open && activeIndex >= 0) {
      itemRefs.current.get(activeIndex)?.focus();
    }
  }, [open, activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    resetPointerMovement();
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
      case "Tab":
        // ARIA APG: Tab closes the menu and moves on — never trap, never pull focus back.
        skipReturnFocus();
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

  const childProps = children.props as TriggerProps;
  const triggerProps: TriggerProps = {
    onContextMenu: (event) => {
      childProps.onContextMenu?.(event);
      if (!event.defaultPrevented) handleContextMenu(event);
    },
    onKeyDown: (event) => {
      childProps.onKeyDown?.(event);
      handleTriggerKeyDown(event);
    },
  };
  if (shouldInjectTabIndex(children)) {
    triggerProps.tabIndex = 0;
    triggerProps.className = cn(childProps.className, styles.target);
  }

  const popupAttrs = supportsPopupAttrs(children)
    ? {
        "aria-haspopup": "menu" as const,
        "aria-expanded": open,
        "aria-controls": open ? menuId : undefined,
      }
    : {};

  return (
    <>
      <div ref={ref} style={{ display: "contents" }}>
        {cloneElement(children, { ...triggerProps, ...popupAttrs })}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            className={styles.menu}
            role="menu"
            style={{ left: position.x, top: position.y }}
            onKeyDown={handleKeyDown}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={motionPreset.springGentle}
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
                  className={cn(styles.item, item.destructive && styles.destructive)}
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
                    if (!item.disabled && hasPointerMoved()) setActiveIndex(i);
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
