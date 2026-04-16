import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import styles from "./EmptyState.module.css";

/* ── Default icon — empty box line-art ── */
const DefaultIcon = (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {/* Open box with flaps */}
    <path d="M8 16v14a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V16" />
    <polyline points="4 16 20 8 36 16" />
    <line x1="20" y1="8" x2="20" y2="22" />
    <line x1="14" y1="22" x2="26" y2="22" strokeDasharray="2 2" />
  </svg>
);

/* ── Types ───────────────────────────────────── */
/**
 * Props for the EmptyState component, a centered placeholder shown when a list, table,
 * or content area has no items to display.
 *
 * If no `icon` is provided a default open-box illustration is rendered automatically.
 *
 * @example
 * <EmptyState
 *   heading="No results"
 *   description="Try adjusting your filters."
 *   action={<Button>Clear filters</Button>}
 * />
 */
export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Custom icon — rendered above the heading */
  icon?: ReactNode;
  /** Heading text */
  heading?: string;
  /** Description text below the heading */
  description?: string;
  /** Action slot — typically a Button */
  action?: ReactNode;
  /** Surface variant */
  variant?: "flat" | "elevated";
  /** Size — affects icon size, spacing, and typography */
  size?: "sm" | "md";
}

/* ── Component ──────────────────────────────── */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, heading, description, action, variant = "flat", size = "md", className = "", ...rest },
  ref
) {
  const resolvedIcon = icon === undefined ? DefaultIcon : icon;

  const classes = [
    styles.emptyState,
    variant === "elevated" ? styles.elevated : "",
    size === "sm" ? styles.sm : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={classes} {...rest}>
      {resolvedIcon && <div className={styles.icon}>{resolvedIcon}</div>}

      {heading && <p className={styles.heading}>{heading}</p>}

      {description && <p className={styles.description}>{description}</p>}

      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
});

EmptyState.displayName = "EmptyState";
