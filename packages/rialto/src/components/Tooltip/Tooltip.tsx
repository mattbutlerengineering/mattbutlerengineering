import {
  forwardRef,
  useState,
  useRef,
  useCallback,
  useId,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { precision } from "../../tokens/motion";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { cn } from "../../utils/class-composer";
import styles from "./Tooltip.module.css";

/**
 * A lightweight hover/focus tooltip for displaying short informational text.
 * Appears after a configurable delay and disappears immediately on mouse leave or blur.
 *
 * @example
 * <Tooltip content="Copy to clipboard" placement="top">
 *   <IconButton icon={<CopyIcon />} />
 * </Tooltip>
 */
export interface TooltipProps {
  /** Text or ReactNode displayed inside the tooltip bubble */
  content: ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  /** Delay in ms before showing */
  delay?: number;
  /** When false, tooltip only shows on hover, not focus. Default: true. */
  showOnFocus?: boolean;
  /** The element that triggers the tooltip on hover/focus */
  children: ReactNode;
  className?: string;
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  ({ content, placement = "top", delay = 400, showOnFocus = true, children, className }, ref) => {
    const [open, setOpen] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const shouldReduceMotion = useReducedMotion();
    const tooltipId = useId();

    const show = useCallback(() => {
      timeoutRef.current = setTimeout(() => setOpen(true), delay);
    }, [delay]);

    const hide = useCallback(() => {
      clearTimeout(timeoutRef.current);
      setOpen(false);
    }, []);

    useEscapeKey(hide, open);

    // Axis-aware animation origin
    const axis = placement === "top" || placement === "bottom" ? "y" : "x";
    const sign = placement === "top" || placement === "left" ? 1 : -1;
    const initial = { opacity: 0, scale: 0.95, [axis]: 4 * sign };
    const animate = { opacity: 1, scale: 1, [axis]: 0 };

    // Centering offset per placement
    const translateMap = {
      top: "translateX(-50%)",
      bottom: "translateX(-50%)",
      left: "translateY(-50%)",
      right: "translateY(-50%)",
    };

    // Inject aria-describedby onto the actual focusable trigger (matching
    // DropdownMenu's cloneElement pattern) — screen readers only announce
    // aria-describedby for the element that currently has DOM focus, and
    // the wrapper div below never receives focus.
    const trigger = isValidElement(children)
      ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          "aria-describedby": open ? tooltipId : undefined,
        })
      : children;

    return (
      <div
        ref={ref}
        className={cn(styles.wrapper, className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={showOnFocus ? show : undefined}
        onBlur={showOnFocus ? hide : undefined}
      >
        {trigger}
        <AnimatePresence>
          {open && (
            <motion.div
              id={tooltipId}
              className={cn(styles.tooltip, styles[placement])}
              role="tooltip"
              style={{ translate: translateMap[placement] }}
              initial={shouldReduceMotion ? { opacity: 0 } : initial}
              animate={shouldReduceMotion ? { opacity: 1 } : animate}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              transition={precision}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

Tooltip.displayName = "Tooltip";
