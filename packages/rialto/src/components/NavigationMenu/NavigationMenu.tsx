import {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type HTMLAttributes,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { useDismiss } from "../../hooks/useDismiss";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import styles from "./NavigationMenu.module.css";

/**
 * A single navigation link or a parent that contains nested child links.
 * Items with `children` render as dropdown triggers; leaf items render as plain links.
 *
 * @example
 * const item: NavItem = {
 *   label: "Products",
 *   children: [
 *     { label: "Widgets", href: "/widgets" },
 *     { label: "Gadgets", href: "/gadgets" },
 *   ],
 * };
 */
export interface NavItem {
  label: string;
  /** URL for leaf-level links. Ignored when `children` is provided. */
  href?: string;
  /** Nested items displayed in a dropdown panel. */
  children?: NavItem[];
}

/**
 * Horizontal dropdown navigation bar for top-level site navigation.
 * Dropdowns open on hover with a short delay and close when the pointer leaves.
 * Supports keyboard navigation (Arrow keys, Home, End, Escape) inside open panels.
 *
 * @example
 * <NavigationMenu
 *   items={[
 *     { label: "Home", href: "/" },
 *     { label: "Docs", children: [
 *       { label: "Getting Started", href: "/docs/start" },
 *     ]},
 *   ]}
 * />
 */
export interface NavigationMenuProps extends HTMLAttributes<HTMLElement> {
  items: NavItem[];
}

const OPEN_DELAY = 200;
const CLOSE_DELAY = 150;

function NavChevron({ open }: { open: boolean }) {
  const motionPreset = useMotionPreset();
  return (
    <motion.svg
      className={styles.chevron}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      animate={{ rotate: open ? 180 : 0 }}
      transition={motionPreset.springGentle}
    >
      <path d="M2 3.5l3 3 3-3" />
    </motion.svg>
  );
}

function NavTrigger({
  item,
  openId,
  onOpen,
  onClose,
}: {
  item: NavItem;
  openId: string | null;
  onOpen: (label: string) => void;
  onClose: () => void;
}) {
  const motionPreset = useMotionPreset();
  const shouldReduceMotion = motionPreset.reduced;
  const openTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const skipFocusOpen = useRef(false);
  const focusFirstOnOpenRef = useRef(false);
  const isOpen = openId === item.label;

  const hasChildren = item.children && item.children.length > 0;

  const startOpen = () => {
    clearTimeout(closeTimeout.current);
    openTimeout.current = setTimeout(() => onOpen(item.label), OPEN_DELAY);
  };

  const startClose = () => {
    clearTimeout(openTimeout.current);
    closeTimeout.current = setTimeout(onClose, CLOSE_DELAY);
  };

  const cancelClose = () => {
    clearTimeout(closeTimeout.current);
  };

  useEffect(() => {
    return () => {
      clearTimeout(openTimeout.current);
      clearTimeout(closeTimeout.current);
    };
  }, []);

  const openImmediately = () => {
    clearTimeout(closeTimeout.current);
    clearTimeout(openTimeout.current);
    onOpen(item.label);
  };

  // Escape must close even when the menu was opened by hover and focus is
  // still outside the trigger and panel. Returning focus sets skipFocusOpen
  // first so the trigger's focus handler does not schedule a reopen.
  const closeAndReturnFocus = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger && document.activeElement !== trigger) {
      skipFocusOpen.current = true;
      trigger.focus();
    }
    onClose();
  }, [onClose]);

  useEscapeKey(closeAndReturnFocus, isOpen);

  useLayoutEffect(() => {
    if (!isOpen || !focusFirstOnOpenRef.current) return;
    focusFirstOnOpenRef.current = false;
    const first = panelRef.current?.querySelector<HTMLElement>("[role='menuitem']");
    first?.focus();
  }, [isOpen]);

  // Keyboard nav inside dropdown
  const handlePanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>("[role='menuitem']"));
      const idx = items.indexOf(document.activeElement as HTMLElement);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeAndReturnFocus();
      }
    },
    [closeAndReturnFocus]
  );

  // A pending hover/focus timer must not reopen a menu the trigger just
  // toggled shut (focus runs on mousedown, before the click that closes).
  const closeFromTrigger = () => {
    clearTimeout(openTimeout.current);
    clearTimeout(closeTimeout.current);
    onClose();
  };

  const handleTriggerClick = () => {
    if (isOpen) closeFromTrigger();
    else openImmediately();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      // preventDefault suppresses the native click so keyboard activation
      // toggles once instead of opening and immediately closing.
      e.preventDefault();
      handleTriggerClick();
      return;
    }
    if (!isOpen && e.key === "ArrowDown") {
      e.preventDefault();
      focusFirstOnOpenRef.current = true;
      openImmediately();
      return;
    }
    if (isOpen) handlePanelKeyDown(e);
  };

  const handleTriggerFocus = () => {
    if (skipFocusOpen.current) {
      skipFocusOpen.current = false;
      return;
    }
    startOpen();
  };

  if (!hasChildren) {
    return (
      <a className={styles.trigger} href={item.href}>
        {item.label}
      </a>
    );
  }

  return (
    <div className={styles.triggerWrapper} onMouseEnter={startOpen} onMouseLeave={startClose}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleTriggerClick}
        onFocus={handleTriggerFocus}
        onBlur={startClose}
        onKeyDown={handleTriggerKeyDown}
      >
        {item.label}
        <NavChevron open={isOpen} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            className={styles.dropdown}
            role="menu"
            initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.95, y: -4 }}
            transition={motionPreset.springGentle}
            onMouseEnter={cancelClose}
            onMouseLeave={startClose}
            onFocus={cancelClose}
            onBlur={startClose}
            onKeyDown={handlePanelKeyDown}
          >
            {item.children!.map((child) => (
              <a
                key={child.label}
                className={styles.item}
                href={child.href}
                role="menuitem"
                tabIndex={-1}
              >
                {child.label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const NavigationMenu = forwardRef<HTMLElement, NavigationMenuProps>(
  ({ items, className, ...props }, ref) => {
    const { messages } = useRialtoLocale();
    const [openId, setOpenId] = useState<string | null>(null);

    const navRef = useRef<HTMLElement>(null);
    const closeAll = useCallback(() => setOpenId(null), []);

    useDismiss(navRef, closeAll, { enabled: openId !== null });

    return (
      <nav
        ref={(node) => {
          (navRef as React.MutableRefObject<HTMLElement | null>).current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn(styles.nav, className)}
        aria-label={messages.mainNavigation}
        {...props}
      >
        {items.map((item) => (
          <NavTrigger
            key={item.label}
            item={item}
            openId={openId}
            onOpen={(label) => setOpenId(label)}
            onClose={closeAll}
          />
        ))}
      </nav>
    );
  }
);

NavigationMenu.displayName = "NavigationMenu";
