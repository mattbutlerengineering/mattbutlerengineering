import {
  useState,
  useRef,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  forwardRef,
  cloneElement,
  type ForwardedRef,
  type ReactNode,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { useReturnFocus } from "../../hooks/useReturnFocus";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useDismiss } from "../../hooks/useDismiss";
import { cn } from "../../utils/class-composer";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { DialogLayerContext } from "../Dialog/DialogLayerContext";
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

/**
 * Viewport-fixed coordinates for a panel anchored to `rect`. The placement
 * class still supplies the centring `translate`; these supply the anchor point.
 * Unused edges are returned as "" so a flip clears the previous side. A top or
 * bottom panel that does not fit on its side flips to the roomier one, and is
 * capped (scrolling) to the room it has, so it is never cut off by the viewport.
 */
function floatingPosition(
  rect: DOMRect,
  placement: Placement,
  panelHeight: number,
  gap = 8
): Record<string, string> {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const midX = rect.left + rect.width / 2;
  const midY = rect.top + rect.height / 2;
  const none = { left: "", right: "", top: "", bottom: "", maxHeight: "" };
  if (placement === "left")
    return { ...none, right: `${vw - rect.left + gap}px`, top: `${midY}px` };
  if (placement === "right") return { ...none, left: `${rect.right + gap}px`, top: `${midY}px` };
  const below = vh - rect.bottom - gap;
  const above = rect.top - gap;
  const fitsPreferred = panelHeight <= (placement === "bottom" ? below : above);
  const useBottom = fitsPreferred ? placement === "bottom" : below >= above;
  const room = Math.floor(useBottom ? below : above);
  const cap = panelHeight > room ? { maxHeight: `${Math.max(room, 0)}px` } : {};
  return useBottom
    ? { ...none, ...cap, left: `${midX}px`, top: `${rect.bottom + gap}px` }
    : { ...none, ...cap, left: `${midX}px`, bottom: `${vh - rect.top + gap}px` };
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

  // Inside a Dialog the panel would be clipped by the dialog's scrolling body
  // (position: absolute is trapped by any overflow ancestor). Lift it into the
  // dialog's layer, beside the panel, and place it by the wrapper's viewport
  // rect, as Select does. Outside a Dialog nothing changes. Imperative style
  // writes (no setState), re-run on resize and on any scroll, including the
  // dialog body's, so the panel tracks its trigger.
  const dialogLayer = useContext(DialogLayerContext);
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const panel = panelRef.current;
    if (!open || !dialogLayer || !wrapper || !panel) return;
    const update = () => {
      Object.assign(
        panel.style,
        floatingPosition(wrapper.getBoundingClientRect(), placement, panel.scrollHeight)
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, dialogLayer, placement]);

  const panelNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          id={panelId}
          className={cn(styles.panel, styles[placement], dialogLayer && styles.floating)}
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
                data-focus-trap-skip-initial="true"
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
  );

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
      {dialogLayer ? createPortal(panelNode, dialogLayer) : panelNode}
    </div>
  );
});

Popover.displayName = "Popover";
