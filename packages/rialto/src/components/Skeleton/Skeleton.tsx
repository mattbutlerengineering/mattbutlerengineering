import { forwardRef, type CSSProperties } from "react";
import styles from "./Skeleton.module.css";

/* ── Types ───────────────────────────────────── */
type SkeletonVariant = "text" | "heading" | "circle" | "rect" | "card";

/**
 * Props for the Skeleton component, a pulsing placeholder shape that communicates loading
 * state before real content appears.
 *
 * Use `lines` with `"text"` or `"heading"` variants to generate a multi-line paragraph skeleton
 * where the last line is automatically shortened for a natural look.
 *
 * @example
 * <Skeleton variant="circle" width={48} />
 * <Skeleton variant="text" lines={3} width="100%" />
 * <Skeleton variant="card" width={300} height={180} />
 */
interface SkeletonProps {
  /** Shape variant controls border-radius and default height */
  variant?: SkeletonVariant;
  /** Explicit width (CSS value) */
  width?: string | number;
  /** Explicit height (CSS value) */
  height?: string | number;
  /** Number of skeleton lines to render (for text/heading) */
  lines?: number;
  /** Gap between lines */
  gap?: string | number;
  className?: string;
}

/* ── Component ──────────────────────────────── */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ variant = "rect", width, height, lines = 1, gap = 8, className = "" }, ref) => {
    const style: CSSProperties = {
      width: typeof width === "number" ? `${width}px` : width,
      height: typeof height === "number" ? `${height}px` : height,
      ...(variant === "circle" && !height && width
        ? { height: typeof width === "number" ? `${width}px` : width }
        : {}),
    };

    const variantClass = styles[variant] ?? "";

    if (lines > 1 && (variant === "text" || variant === "heading")) {
      return (
        <div
          ref={ref}
          className={className}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: typeof gap === "number" ? `${gap}px` : gap,
          }}
          aria-hidden="true"
        >
          {Array.from({ length: lines }, (_, i) => (
            <div
              key={i}
              className={`${styles.skeleton} ${variantClass}`}
              style={{
                ...style,
                // Last line is shorter for a natural paragraph look
                width: i === lines - 1 ? "60%" : style.width,
              }}
            />
          ))}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={`${styles.skeleton} ${variantClass} ${className}`}
        style={style}
        aria-hidden="true"
      />
    );
  }
);
Skeleton.displayName = "Skeleton";

/* ── Skeleton Group (compose a loading card) ── */
/**
 * Props for the SkeletonGroup component, a semantic wrapper that groups multiple
 * Skeleton elements into a single ARIA `role="status"` region with `aria-busy="true"`.
 *
 * Use this to compose complex loading placeholders (e.g. a card with avatar + text lines).
 *
 * @example
 * <SkeletonGroup>
 *   <Skeleton variant="circle" width={40} />
 *   <Skeleton variant="text" lines={2} width="80%" />
 * </SkeletonGroup>
 */
interface SkeletonGroupProps {
  children: React.ReactNode;
  className?: string;
}

export const SkeletonGroup = forwardRef<HTMLDivElement, SkeletonGroupProps>(
  ({ children, className = "" }, ref) => {
    return (
      <div
        ref={ref}
        className={className}
        role="status"
        aria-label="Loading content"
        aria-busy="true"
      >
        {children}
      </div>
    );
  }
);
SkeletonGroup.displayName = "SkeletonGroup";
