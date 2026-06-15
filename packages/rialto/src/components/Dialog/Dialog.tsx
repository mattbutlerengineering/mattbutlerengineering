import { forwardRef, useEffect, useId, useRef, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { springGentle, precision } from "../../tokens/motion";
import { useReturnFocus } from "../../hooks/useReturnFocus";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Heading } from "../Heading/Heading";
import styles from "./Dialog.module.css";

/**
 * A modal dialog that renders centered over a backdrop overlay.
 * Traps focus inside the panel while open and closes on Escape or backdrop click.
 *
 * @example
 * <Dialog open={showDialog} onClose={() => setShowDialog(false)} title="Edit profile">
 *   <p>Dialog body content here.</p>
 * </Dialog>
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  /** Content rendered below the body in a fixed footer area */
  footer?: ReactNode;
  className?: string;
}

export const Dialog = forwardRef<HTMLDivElement, DialogProps>(
  ({ open, onClose, title, description, children, footer }, ref) => {
    const shouldReduceMotion = useReducedMotion();
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const descriptionId = useId();

    useReturnFocus(open);

    // Close on Escape
    useEffect(() => {
      if (!open) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open, onClose]);

    useFocusTrap(panelRef, open);

    const motionProps = shouldReduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12, scale: 0.97 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: 8, scale: 0.98 },
        };

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={precision}
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <motion.div
              ref={(node) => {
                (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
                if (typeof ref === "function") ref(node);
                else if (ref) ref.current = node;
              }}
              className={styles.panel}
              role="dialog"
              aria-modal
              aria-labelledby={title ? titleId : undefined}
              aria-label={title ? undefined : "Dialog"}
              aria-describedby={description ? descriptionId : undefined}
              transition={shouldReduceMotion ? { duration: 0 } : springGentle}
              {...motionProps}
            >
              <div className={styles.header}>
                {title && (
                  <Heading level={2} size={6} id={titleId} className={styles.title}>
                    {title}
                  </Heading>
                )}
                <button
                  type="button"
                  className={styles.close}
                  onClick={onClose}
                  aria-label="Close dialog"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M1 1l12 12M13 1L1 13" />
                  </svg>
                </button>
              </div>
              {description && (
                <p id={descriptionId} className={styles.description}>
                  {description}
                </p>
              )}
              {children}
              {footer && <div className={styles.footer}>{footer}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

Dialog.displayName = "Dialog";
