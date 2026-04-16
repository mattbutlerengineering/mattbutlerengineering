import React, { useEffect, useCallback, useRef, forwardRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { spring } from "../../tokens/motion";
import { useDirection } from "../../hooks/useDirection";
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
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const dir = useDirection(anchorRef);

  // Capture trigger element on open; restore focus to it on close
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

  /* ── Escape key ──────────────────────────── */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  // Trap focus inside drawer when open
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [open]);

  const panelClasses = [styles.panel, styles[side], size !== "default" ? styles[size] : ""]
    .filter(Boolean)
    .join(" ");

  const slideHidden = getSlideVariants(side, dir === "rtl");

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
              transition={{ duration: 0.2 }}
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
              aria-labelledby={title ? "rialto-drawer-title" : undefined}
              aria-label={title ? undefined : "Drawer"}
              initial={slideHidden}
              animate={slideOpen[side]}
              exit={slideHidden}
              transition={spring}
            >
              {/* Header */}
              {(title || description) && (
                <div className={styles.header}>
                  <div className={styles.headerContent}>
                    {title && <h2 id="rialto-drawer-title" className={styles.title}>{title}</h2>}
                    {description && <p className={styles.description}>{description}</p>}
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
