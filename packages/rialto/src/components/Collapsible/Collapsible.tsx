import { forwardRef, useState, useId, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { springGentle } from "../../tokens/motion";
import styles from "./Collapsible.module.css";

/**
 * Single expand/collapse section with an animated content region.
 *
 * Works in both controlled (`open` + `onOpenChange`) and uncontrolled
 * (`defaultOpen`) modes. The expand/collapse transition uses spring physics
 * and respects `prefers-reduced-motion`.
 *
 * @example
 * <Collapsible trigger="Show details">
 *   <Text>Hidden content revealed on expand.</Text>
 * </Collapsible>
 */
export interface CollapsibleProps {
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Default open state (uncontrolled) */
  defaultOpen?: boolean;
  /** Trigger element */
  trigger: ReactNode;
  /** Collapsible content */
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

function Chevron({ open }: { open: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.svg
      className={styles.chevron}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      animate={{ rotate: open ? 180 : 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : springGentle}
    >
      <path d="M3 5.5l4 4 4-4" />
    </motion.svg>
  );
}

export const Collapsible = forwardRef<HTMLDivElement, CollapsibleProps>(
  (
    {
      open: controlledOpen,
      onOpenChange,
      defaultOpen = false,
      trigger,
      children,
      disabled = false,
      className,
    },
    ref
  ) => {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const isControlled = controlledOpen !== undefined;
    const isOpen = isControlled ? controlledOpen : internalOpen;
    const shouldReduceMotion = useReducedMotion();

    const contentId = useId();
    const triggerId = useId();

    const toggle = () => {
      if (disabled) return;
      const next = !isOpen;
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    };

    return (
      <div ref={ref} className={[styles.collapsible, className].filter(Boolean).join(" ")}>
        <button
          id={triggerId}
          className={styles.trigger}
          onClick={toggle}
          aria-disabled={disabled || undefined}
          aria-expanded={isOpen}
          aria-controls={contentId}
          data-open={isOpen}
        >
          <span className={styles.triggerLabel}>{trigger}</span>
          <Chevron open={isOpen} />
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              className={styles.content}
              id={contentId}
              role="region"
              aria-labelledby={triggerId}
              initial={shouldReduceMotion ? { height: "auto" } : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : springGentle}
            >
              <div className={styles.contentInner}>{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

Collapsible.displayName = "Collapsible";
