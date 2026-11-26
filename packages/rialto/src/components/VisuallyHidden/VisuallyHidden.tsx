import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../utils/class-composer";
import styles from "./VisuallyHidden.module.css";

/**
 * Removes content visually while keeping it in the accessibility tree, so
 * screen readers announce it (for example an icon-only button's name).
 *
 * @example
 * <button type="button">
 *   <CloseIcon aria-hidden="true" />
 *   <VisuallyHidden>Close</VisuallyHidden>
 * </button>
 */
export interface VisuallyHiddenProps extends HTMLAttributes<HTMLSpanElement> {
  /** Reveal the content while it or a descendant has focus (e.g. skip links). */
  focusable?: boolean;
}

export const VisuallyHidden = forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  ({ focusable = false, className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(styles.root, focusable && styles.focusable, className)}
      {...props}
    />
  )
);

VisuallyHidden.displayName = "VisuallyHidden";
