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
import styles from "./Popover.module.css";

/* ── Types ───────────────────────────────────── */
type Placement = "top" | "bottom" | "left" | "right";

/**
 * A click-triggered floating panel positioned relative to its trigger element.
 * Use for interactive content like forms, filters, or rich controls that need
 * to stay anchored to a specific UI element. Closes on outside click or Escape.
 *
 * @example
 * <Popover trigger={<Button>Options</Button>} placement="bottom" title="Filter">
 *   <p>Popover content here</p>
 * </Popover>
 */
interface PopoverProps {
  /** The trigger element — click opens the popover */
  trigger: ReactElement;
  /** Optional title shown in the header */
  title?: string;
  /** Popover body content */
  children: ReactNode;
  /** Placement relative to trigger */
  placement?: Placement;
  className?: string;
}

/* ── Motion origins per placement ────────────── */
const motionOrigin: Record<Placement, { y?: number; x?: number; scale: number }> = {
  top: { y: 6, scale: 0.96 },
  bottom: { y: -6, scale: 0.96 },
  left: { x: 6, scale: 0.96 },
  right: { x: -6, scale: 0.96 },
};

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
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(
  { trigger, title, children, placement = "bottom", className = "" },
  ref
) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const close = useCallback(() => setOpen(false), []);

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

  // Escape key
  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, close]);

  // Focus first focusable element on open
  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    });
  }, [open]);

  const origin = motionOrigin[placement];

  return (
    <div ref={mergeRefs(ref, wrapperRef)} className={`${styles.wrapper} ${className}`}>
      {/* Trigger — ARIA attributes injected onto the trigger element itself */}
      <div
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        {cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
          "aria-haspopup": "dialog",
          "aria-expanded": open,
        })}
      </div>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            className={`${styles.panel} ${styles[placement]}`}
            role="dialog"
            aria-label={title ?? "Popover"}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, ...origin }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, ...origin }}
            transition={shouldReduceMotion ? { duration: 0.1 } : springGentle}
          >
            {title && (
              <div className={styles.header}>
                <span className={styles.title}>{title}</span>
                <button className={styles.close} onClick={close} aria-label="Close">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M1 1l8 8M9 1l-8 8" />
                  </svg>
                </button>
              </div>
            )}
            <div className={styles.body}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

Popover.displayName = "Popover";
