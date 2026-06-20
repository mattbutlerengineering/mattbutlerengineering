import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn, variantClass } from "../../utils/class-composer";
import styles from "./Badge.module.css";

/**
 * A small status indicator label for counts, states, or categories.
 * Use the `dot` prop to prepend a colored status circle before the text.
 *
 * @example
 * <Badge variant="success" dot>
 *   Connected
 * </Badge>
 */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "accent" | "success" | "warning" | "error";
  /** Compact or default size */
  size?: "sm" | "md";
  /** Show a status dot before the label */
  dot?: boolean;
  children: ReactNode;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", size = "md", dot, className, children, ...props }, ref) => {
    const classes = cn(styles.badge, styles[variant], variantClass(styles, size, "md"), className);

    return (
      <span ref={ref} className={classes} {...props}>
        {dot && <span className={styles.dot} />}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
