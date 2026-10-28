import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import styles from "./AppBar.module.css";

/**
 * Horizontal sticky top bar with optional glass surface.
 * Replaces per-app custom navbar implementations with a
 * consistent, animated header.
 *
 * @example
 * <AppBar
 *   logo={<span>Acme</span>}
 *   actions={<ThemeToggle />}
 * />
 */
export interface AppBarProps extends Pick<
  HTMLAttributes<HTMLElement>,
  "id" | "aria-label" | "className" | "style"
> {
  /** Left-aligned brand element. */
  logo?: ReactNode;
  /** Right-aligned action slot (theme toggle, links, etc.). */
  actions?: ReactNode;
  /** Apply glass surface with backdrop blur. Default true. */
  glass?: boolean;
  /** Bar height. Default "56px". */
  height?: string;
}

export const AppBar = forwardRef<HTMLElement, AppBarProps>(
  ({ logo, actions, glass = true, height = "56px", className, style, ...props }, ref) => {
    const motionPreset = useMotionPreset();
    const shouldReduceMotion = motionPreset.reduced;

    const classes = cn(styles.appBar, glass && styles.glass, className);

    return (
      <motion.header
        ref={ref}
        className={classes}
        style={{ minHeight: height, height: "auto", ...style }}
        initial={shouldReduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionPreset.springGentle}
        {...props}
      >
        {logo && <div className={styles.logo}>{logo}</div>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </motion.header>
    );
  }
);

AppBar.displayName = "AppBar";
