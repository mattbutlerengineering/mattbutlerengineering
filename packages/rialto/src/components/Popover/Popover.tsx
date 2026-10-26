import {
  useState,
  useRef,
  useCallback,
  useId,
  forwardRef,
  cloneElement,
  type ForwardedRef,
  type ReactNode,
  type ReactElement,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { useReturnFocus } from "../../hooks/useReturnFocus";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useDismiss } from "../../hooks/useDismiss";
import { cn } from "../../utils/class-composer";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
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
export interface PopoverProps {
  /** The trigger element — click opens the popover */
  trigger: ReactElement;
  /** Optional title shown in the header */
  title?: string;
  /** Popover body content */
  children: ReactNode;
  /** Placement relative to trigger */
  placement?: Placement;
  /**
   * Controlled open state. When provided, the parent owns open/close and must
   * update it in response to `onOpenChange`. Omit for uncontrolled behaviour.
   */
  open?: boolean;
  /** Called with the requested next state on every open/close attempt (trigger, Escape, outside click, close button). */
  onOpenChange?: (open: boolean) => void;
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
  { trigger, title, children, placement = "bottom", open: openProp, onOpenChange, className = "" },
  ref
) {
  const [internalOpen, setInternalOpen] = useState(false);
  // Render-time derivation: controlled when `open` is provided.
  const open = openProp ?? internalOpen;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { messages } = useRialtoLocale();
  const motionPreset = useMotionPreset();
  const shouldReduceMotion = motionPreset.reduced;
  const panelId = useId();

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange]
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  // React synthetic events bubble through portals, so a press inside a
  // descendant portaled to document.body (e.g. a Select listbox) reaches this
  // wrapper's onMouseDown even though the DOM node is outside wrapperRef.
  // Remember that native event so the document-level dismiss can skip it.
  const insidePressRef = useRef<Event | null>(null);
  const isPortaledPress = useCallback((e: MouseEvent) => e === insidePressRef.current, []);

  useReturnFocus(open);
  useEscapeKey(close, open);
  useFocusTrap(panelRef, open);

  useDismiss(wrapperRef, close, { enabled: open, isInside: isPortaledPress });

  const origin = motionOrigin[placement];

  return (
    <div
      role="presentation"
      ref={mergeRefs(ref, wrapperRef)}
      className={cn(styles.wrapper, className)}
      onMouseDown={(e) => {
        insidePressRef.current = e.nativeEvent;
      }}
    >
      {/* Trigger — ARIA attributes injected onto the trigger element itself */}
      <div
        role="presentation"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            // preventDefault suppresses the native click (no double toggle). For a
            // native <button> re-dispatch it once so the consumer's onClick fires
            // on keyboard activation; it bubbles to the toggle above.
            e.preventDefault();
            const button = (e.target as Element).closest("button");
            if (button) button.click();
            else setOpen(!open);
          }
        }}
      >
        {cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-controls": panelId,
        })}
      </div>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={panelId}
            className={cn(styles.panel, styles[placement])}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? messages.popover}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, ...origin }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, ...origin }}
            transition={motionPreset.springGentle}
          >
            {title && (
              <div className={styles.header}>
                <span className={styles.title}>{title}</span>
                <button
                  type="button"
                  className={styles.close}
                  onClick={close}
                  aria-label={messages.close}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    aria-hidden="true"
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
