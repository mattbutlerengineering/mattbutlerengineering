import {
  forwardRef,
  useState,
  useRef,
  useCallback,
  type ReactNode,
  type ReactElement,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { cn } from "../../utils/class-composer";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import styles from "./HoverCard.module.css";

/* ── Types ───────────────────────────────────── */
type Placement = "top" | "bottom";

/**
 * A rich hover preview card that appears when the user hovers or focuses the trigger.
 * Unlike Tooltip, HoverCard is intended for richer content (images, metadata, links)
 * and remains open while the pointer is inside the card itself.
 *
 * @example
 * <HoverCard content={<UserProfilePreview user={user} />} placement="bottom">
 *   <a href={`/users/${user.id}`}>{user.name}</a>
 * </HoverCard>
 */
export interface HoverCardProps {
  /** The trigger element — hovered to open the card */
  children: ReactElement;
  /** Rich content rendered inside the glass panel */
  content: ReactNode;
  /** Placement relative to trigger */
  placement?: Placement;
  /** Delay in ms before showing (default 400ms) */
  openDelay?: number;
  /** Delay in ms before hiding after mouse leaves (default 200ms) */
  closeDelay?: number;
  /** Additional class on the panel */
  className?: string;
}

/* ── Motion origins per placement ────────────── */
const motionOrigin: Record<Placement, { y: number; scale: number }> = {
  top: { y: 6, scale: 0.96 },
  bottom: { y: -6, scale: 0.96 },
};

/* ── Component ──────────────────────────────── */
export const HoverCard = forwardRef<HTMLDivElement, HoverCardProps>(
  (
    {
      children,
      content,
      placement = "bottom",
      openDelay = 400,
      closeDelay: closeDelayMs = 200,
      className,
    },
    ref
  ) => {
    const { messages } = useRialtoLocale();
    const [open, setOpen] = useState(false);
    const openTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const motionPreset = useMotionPreset();
    const shouldReduceMotion = motionPreset.reduced;

    const scheduleOpen = useCallback(() => {
      clearTimeout(closeTimeoutRef.current);
      openTimeoutRef.current = setTimeout(() => setOpen(true), openDelay);
    }, [openDelay]);

    const scheduleClose = useCallback(() => {
      clearTimeout(openTimeoutRef.current);
      closeTimeoutRef.current = setTimeout(() => setOpen(false), closeDelayMs);
    }, [closeDelayMs]);

    const cancelClose = useCallback(() => {
      clearTimeout(closeTimeoutRef.current);
    }, []);

    const closeImmediate = useCallback(() => {
      clearTimeout(openTimeoutRef.current);
      clearTimeout(closeTimeoutRef.current);
      setOpen(false);
    }, []);

    useEscapeKey(closeImmediate, open);

    const origin = motionOrigin[placement];

    return (
      <div
        ref={ref}
        className={cn(styles.wrapper, className)}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
      >
        {children}
        <AnimatePresence>
          {open && (
            <motion.div
              className={cn(styles.panel, styles[placement])}
              role="dialog"
              aria-label={messages.preview}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, ...origin }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, ...origin }}
              transition={motionPreset.springGentle}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);
HoverCard.displayName = "HoverCard";
