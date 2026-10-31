import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { useReturnFocus } from "../../hooks/useReturnFocus";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { Heading } from "../Heading/Heading";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { DialogLayerContext } from "./DialogLayerContext";
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
    const parentLayer = useContext(DialogLayerContext);
    // Created up front so a nested dialog can portal into it on its first
    // render; the overlay's ref attaches it before any effect runs.
    const [layer] = useState(() =>
      typeof document === "undefined" ? null : document.createElement("div")
    );
    const attachLayer = useCallback(
      (overlay: HTMLDivElement | null) => {
        if (overlay && layer) overlay.appendChild(layer);
      },
      [layer]
    );
    const { messages } = useRialtoLocale();
    const motionPreset = useMotionPreset();
    const shouldReduceMotion = motionPreset.reduced;
    const panelRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const descriptionId = useId();

    useReturnFocus(open);
    useEscapeKey(onClose, open);
    useFocusTrap(panelRef, open);

    // A scroll container must be keyboard-reachable (WCAG 2.1.1) or its overflow
    // is unreadable without a mouse. Only an overflowing body earns the tab
    // stop, so short dialogs gain none. Imperative DOM, not state: rialto bans
    // setState in effects. The observer sees the body resize, which is what
    // flips it in or out of overflow once the panel caps its height.
    useEffect(() => {
      const body = bodyRef.current;
      if (!open || !body) return;
      const sync = () => {
        if (body.scrollHeight > body.clientHeight) {
          body.tabIndex = 0;
          body.setAttribute("role", "region");
          body.setAttribute("aria-label", messages.scrollableContent);
        } else {
          body.removeAttribute("tabindex");
          body.removeAttribute("role");
          body.removeAttribute("aria-label");
        }
      };
      sync();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(sync);
      observer.observe(body);
      return () => observer.disconnect();
    }, [open, messages.scrollableContent]);

    const motionProps = shouldReduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12, scale: 0.97 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: 8, scale: 0.98 },
        };

    const dialog = (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={attachLayer}
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionPreset.precision}
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
              aria-label={title ? undefined : messages.dialog}
              aria-describedby={description ? descriptionId : undefined}
              transition={motionPreset.springGentle}
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
                  aria-label={messages.closeDialog}
                  data-focus-trap-skip-initial="true"
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
              {/* The description lives in the scroller so a long one scrolls instead of
                  pushing the footer off-screen; aria-describedby still resolves by id.
                  The body is never the initial focus. */}
              <div ref={bodyRef} className={styles.body} data-focus-trap-skip-initial="true">
                {description && (
                  <p id={descriptionId} className={styles.description}>
                    {description}
                  </p>
                )}
                <DialogLayerContext.Provider value={layer}>{children}</DialogLayerContext.Provider>
              </div>
              {footer && <div className={styles.footer}>{footer}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );

    // A top-level dialog renders in place, so it keeps its RialtoProvider's
    // scoped vibe variables and `dir`. A nested one is portaled beside the outer
    // panel (transformed by framer-motion), which would otherwise trap it and
    // paint it over its text; the layer is still inside the provider subtree.
    return parentLayer ? createPortal(dialog, parentLayer) : dialog;
  }
);

Dialog.displayName = "Dialog";
