import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { springGentle } from "../../tokens/motion";
import styles from "./SplitScreenExit.module.css";

/**
 * A dramatic page-exit transition: the wrapped content splits down the middle
 * and slides offscreen in opposite directions, revealing what's beneath.
 * Inspired by classic RPG/strategy game login screens.
 *
 * The parent owns navigation — fire it from `onExitComplete`, not immediately
 * after setting `active`, or the content unmounts before the animation runs.
 *
 * @example
 * const [exiting, setExiting] = useState(false);
 * const onAuth = () => setExiting(true);
 *
 * <SplitScreenExit
 *   active={exiting}
 *   announcement="Signing you in"
 *   onExitComplete={() => navigate("/dashboard")}
 * >
 *   <SignInForm onSuccess={onAuth} />
 * </SplitScreenExit>
 */
export interface SplitScreenExitProps {
  /** Trigger the exit animation when this flips to true */
  active: boolean;
  /** Fires once after both halves have finished exiting */
  onExitComplete?: () => void;
  /** Screen-reader announcement that plays when `active` becomes true */
  announcement?: string;
  /** Content to show (and to be split on exit) */
  children: ReactNode;
  className?: string;
}

export const SplitScreenExit = forwardRef<HTMLDivElement, SplitScreenExitProps>(
  ({ active, onExitComplete, announcement, children, className }, ref) => {
    const shouldReduceMotion = useReducedMotion();
    const completedHalvesRef = useRef(0);
    const hasFiredRef = useRef(false);

    // Reset completion tracking whenever the exit is re-armed
    useEffect(() => {
      if (!active) {
        completedHalvesRef.current = 0;
        hasFiredRef.current = false;
      }
    }, [active]);

    // Reduced motion collapses the animation — fire the callback on the next
    // tick so parents that expect async still behave correctly.
    useEffect(() => {
      if (!active || !shouldReduceMotion || hasFiredRef.current) return;
      hasFiredRef.current = true;
      const id = window.setTimeout(() => onExitComplete?.(), 0);
      return () => window.clearTimeout(id);
    }, [active, shouldReduceMotion, onExitComplete]);

    function handleHalfComplete() {
      completedHalvesRef.current += 1;
      if (completedHalvesRef.current >= 2 && !hasFiredRef.current) {
        hasFiredRef.current = true;
        onExitComplete?.();
      }
    }

    const classes = [styles.wrapper, active && styles.active, className]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={classes}>
        {/* Live-interactive content — rendered once, owns focus and AT */}
        {!active && <div className={styles.content}>{children}</div>}

        {/* Exit animation — two halves clipped to left/right */}
        {active && (
          <>
            <motion.div
              className={`${styles.half} ${styles.halfLeft}`}
              aria-hidden="true"
              initial={{ x: 0 }}
              animate={{ x: "-100%" }}
              transition={shouldReduceMotion ? { duration: 0 } : springGentle}
              onAnimationComplete={handleHalfComplete}
            >
              <div className={styles.content}>{children}</div>
            </motion.div>
            <motion.div
              className={`${styles.half} ${styles.halfRight}`}
              aria-hidden="true"
              initial={{ x: 0 }}
              animate={{ x: "100%" }}
              transition={shouldReduceMotion ? { duration: 0 } : springGentle}
              onAnimationComplete={handleHalfComplete}
            >
              <div className={styles.content}>{children}</div>
            </motion.div>

            {/* Polite announcement during the transition */}
            {announcement && (
              <span role="status" aria-live="polite" className={styles.srOnly}>
                {announcement}
              </span>
            )}
          </>
        )}
      </div>
    );
  }
);

SplitScreenExit.displayName = "SplitScreenExit";
