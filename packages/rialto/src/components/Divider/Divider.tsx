import { forwardRef } from "react";
import { cn, variantClass } from "../../utils/class-composer";
import styles from "./Divider.module.css";

/* ── Types ───────────────────────────────────── */
/**
 * Visual separator for dividing content sections, rendered as a thin rule.
 *
 * Supports an optional centered text label and a gold accent gradient for
 * emphasis. Renders `role="separator"` with the appropriate `aria-orientation`.
 *
 * @example
 * <Divider />
 * <Divider label="Or" accent />
 * <Divider orientation="vertical" spacing="compact" />
 */
export interface DividerProps {
  /** Orientation */
  orientation?: "horizontal" | "vertical";
  /** Optional centered label */
  label?: string;
  /** Gold accent gradient instead of neutral */
  accent?: boolean;
  /** Spacing: compact (xs), default (md), spacious (lg) */
  spacing?: "compact" | "default" | "spacious";
  className?: string;
}

/* ── Component ──────────────────────────────── */
export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  (
    { orientation = "horizontal", label, accent = false, spacing = "default", className = "" },
    ref
  ) => {
    const classes = cn(
      orientation === "horizontal" ? styles.horizontal : styles.vertical,
      accent && styles.accent,
      variantClass(styles, spacing, "default"),
      className
    );

    return (
      <div ref={ref} className={classes} role="separator" aria-orientation={orientation}>
        {label && <span className={styles.label}>{label}</span>}
      </div>
    );
  }
);
Divider.displayName = "Divider";
