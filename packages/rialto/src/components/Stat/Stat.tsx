import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import styles from "./Stat.module.css";

/**
 * A metric display showing a label, a prominent value, and an optional delta with trend arrow.
 * Use for dashboards and summary panels where a single KPI needs emphasis.
 *
 * @example
 * <Stat
 *   label="Lap Time"
 *   value="1:25.410"
 *   delta="-0.342"
 *   trend="down"
 * />
 */
export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  /** The metric value (e.g. "1:25.410") */
  value: ReactNode;
  /** Descriptive label (e.g. "Lap Time") */
  label: string;
  /** Change indicator (e.g. "-0.342") */
  delta?: string;
  /** Direction of the change */
  trend?: "up" | "down" | "neutral";
  /** Display size */
  size?: "sm" | "md" | "lg";
}

function TrendArrow({ trend }: { trend: "up" | "down" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {trend === "up" ? <path d="M6 10V2m0 0L2 6m4-4l4 4" /> : <path d="M6 2v8m0 0l4-4m-4 4L2 6" />}
    </svg>
  );
}

export const Stat = forwardRef<HTMLDivElement, StatProps>(
  ({ value, label, delta, trend = "neutral", size = "md", className, ...props }, ref) => {
    const classes = [
      styles.stat,
      size === "sm" ? styles.sm : size === "lg" ? styles.lg : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const trendClass =
      trend === "up" ? styles.trendUp : trend === "down" ? styles.trendDown : styles.trendNeutral;

    return (
      <div ref={ref} className={classes} role="group" aria-label={label} {...props}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{value}</span>
        {delta && (
          <span className={[styles.delta, trendClass].join(" ")}>
            {trend !== "neutral" && <TrendArrow trend={trend} />}
            {delta}
          </span>
        )}
      </div>
    );
  }
);

Stat.displayName = "Stat";
