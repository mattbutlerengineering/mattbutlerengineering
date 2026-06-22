import React, { useEffect, useId, useRef, forwardRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { spring, reduced } from "../../tokens/motion";
import { useDirection } from "../../hooks/useDirection";
import { useReturnFocus } from "../../hooks/useReturnFocus";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { Heading } from "../Heading/Heading";
import { cn, variantClass } from "../../utils/class-composer";
import styles from "./Drawer.module.css";

/* ── Types ───────────────────────────────────── */
/**
 * A slide-out panel that enters from an edge of the viewport over a backdrop.
 * Use for secondary content, forms, or detail views that should not fully replace the page.
 * Locks body scroll while open and closes on Escape or backdrop click.
 *
 * @example
 * <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Settings" side="right">
 *   <p>Drawer body content</p>
 * </Drawer>
 */
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Content rendered below the body in a fixed footer area */
  footer?: ReactNode;
  /** Which edge the drawer slides from */
  side?: "right" | "left" | "bottom";
  /** Panel width/height */
  size?: "default" | "wide" | "full";
}

/* ── Slide direction helpers ──────────────────── */
function getSlideVariants(side: "right" | "left" | "bottom", isRtl: boolean) {
  // In RTL, inline-end (right) is physically left and vice versa,
  // so the slide direction must flip for left/right sides.
  const flipX = isRtl;
  const variants = {
    right: { x: flipX ? "-100%" : "100%" },
    left: { x: flipX ? "100%" : "-100%" },
    bottom: { y: "100%" },
  } as const;
  return variants[side];
}

const slideOpen = {
  right: { x: 0 },
  left: { x: 0 },
  bottom: { y: 0 },
} as const;

/* ── Component ──────────────────────────────── */
export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(function Drawer(
  { open, onClose, title, description, children, footer, side = "right", size = "default" },
  ref
) {
  const shouldReduceMotion = useReducedMotion();
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dir = useDirection(anchorRef);
  const titleId = useId();
  const descriptionId = useId();

  useReturnFocus(open);
  useEscapeKey(onClose, open);

  /* ── Body scroll lock ────────────────────── */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useFocusTrap(panelRef, open);

  const panelClasses = cn(styles.panel, styles[side], variantClass(styles, size, "default"));

  const slideHidden = getSlideVariants(side, dir === "rtl");
  const panelInitial = shouldReduceMotion ? {} : slideHidden;
  const panelAnimate = shouldReduceMotion ? {} : slideOpen[side];
  const panelExit = shouldReduceMotion ? {} : slideHidden;
  const panelTransition = shouldReduceMotion ? reduced : spring;

  return (
    <>
      {/* Hidden anchor for direction detection (always in DOM) */}
      <div ref={anchorRef} style={{ display: "none" }} />
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={shouldReduceMotion ? reduced : { duration: 0.2 }}
              onClick={onClose}
            />

            {/* Panel */}
            <motion.div
              ref={(node) => {
                (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
                if (typeof ref === "function") ref(node);
                else if (ref) ref.current = node;
              }}
              className={panelClasses}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-label={title ? undefined : "Drawer"}
              aria-describedby={description ? descriptionId : undefined}
              initial={panelInitial}
              animate={panelAnimate}
              exit={panelExit}
              transition={panelTransition}
            >
              {/* Header */}
              {(title || description) && (
                <div className={styles.header}>
                  <div className={styles.headerContent}>
                    {title && (
                      <Heading level={2} size={5} id={titleId} className={styles.title}>
                        {title}
                      </Heading>
                    )}
                    {description && (
                      <p id={descriptionId} className={styles.description}>
                        {description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.close}
                    onClick={onClose}
                    aria-label="Close"
                  >
                    <svg className={styles.closeIcon} viewBox="0 0 14 14" aria-hidden="true">
                      <line x1="3" y1="3" x2="11" y2="11" />
                      <line x1="11" y1="3" x2="3" y2="11" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Body */}
              <div className={styles.body}>{children}</div>

              {/* Footer */}
              {footer && <div className={styles.footer}>{footer}</div>}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
});

Drawer.displayName = "Drawer";
