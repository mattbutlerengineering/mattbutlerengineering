import { forwardRef, useRef, useEffect, useState, useCallback, type HTMLAttributes } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { spring, boop } from "../../tokens/motion";
import { cn, variantClass } from "../../utils/class-composer";
import { useDirection } from "../../hooks/useDirection";
import styles from "./SegmentedControl.module.css";

/**
 * Describes a single option within a `SegmentedControl`.
 */
export interface Segment {
  id: string;
  label: string;
  disabled?: boolean;
}

/**
 * Pill-style toggle for switching between a small set of mutually exclusive options.
 * A spring-animated indicator slides behind the active segment. Implements `role="radiogroup"`.
 *
 * @example
 * <SegmentedControl
 *   segments={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }]}
 *   value={view}
 *   onChange={setView}
 * />
 */
export interface SegmentedControlProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  segments: Segment[];
  /** Currently selected segment id */
  value: string;
  /** Selection change callback */
  onChange: (id: string) => void;
  size?: "sm" | "md";
}

export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(
  ({ segments, value, onChange, size = "md", className, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const segmentRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const shouldReduceMotion = useReducedMotion();
    const dir = useDirection(containerRef);

    const [indicator, setIndicator] = useState({ offset: 0, width: 0 });

    const measure = useCallback(() => {
      const container = containerRef.current;
      const el = segmentRefs.current.get(value);
      if (!container || !el) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      setIndicator({
        offset: dir === "rtl" ? cRect.right - eRect.right : eRect.left - cRect.left,
        width: eRect.width,
      });
    }, [value, dir]);

    useEffect(() => {
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }, [measure]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      const enabledSegments = segments.filter((s) => !s.disabled);
      const currentIndex = enabledSegments.findIndex((s) => s.id === value);
      let next: number | null = null;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        next = (currentIndex + 1) % enabledSegments.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        next = (currentIndex - 1 + enabledSegments.length) % enabledSegments.length;
      } else if (e.key === "Home") {
        next = 0;
      } else if (e.key === "End") {
        next = enabledSegments.length - 1;
      }

      if (next !== null) {
        e.preventDefault();
        const id = enabledSegments[next]?.id;
        if (id) {
          onChange(id);
          segmentRefs.current.get(id)?.focus();
        }
      }
    };

    return (
      <div
        ref={ref}
        className={cn(styles.container, variantClass(styles, size, "md"), className)}
        {...props}
      >
        <div
          ref={containerRef}
          className={styles.track}
          role="radiogroup"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {/* Sliding indicator */}
          {indicator.width > 0 && (
            <motion.div
              className={styles.indicator}
              style={dir === "rtl" ? { left: "auto" } : { right: "auto" }}
              animate={
                dir === "rtl"
                  ? { right: indicator.offset, width: indicator.width }
                  : { left: indicator.offset, width: indicator.width }
              }
              transition={shouldReduceMotion ? { duration: 0 } : spring}
            />
          )}

          {segments.map((segment) => {
            const active = segment.id === value;
            return (
              <motion.button
                type="button"
                key={segment.id}
                ref={(el) => {
                  if (el) segmentRefs.current.set(segment.id, el);
                }}
                className={cn(styles.segment, active && styles.segmentActive)}
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                aria-disabled={segment.disabled || undefined}
                onClick={
                  segment.disabled
                    ? (e: React.MouseEvent) => e.preventDefault()
                    : () => onChange(segment.id)
                }
                whileHover={
                  segment.disabled || shouldReduceMotion
                    ? undefined
                    : { scale: boop.scale, transition: boop.transition }
                }
              >
                {segment.label}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }
);

SegmentedControl.displayName = "SegmentedControl";
