import { forwardRef, type HTMLAttributes } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { precision } from "../../tokens/motion";
import { cn } from "../../utils/class-composer";
import styles from "./RadialGauge.module.css";

/** Semantic tone for a threshold marker. Never colour-only — paired with position. */
export type RadialGaugeTone = "accent" | "success" | "warning" | "error";

/** A marker placed along the arc at a notable value (target, limit, redline). */
export interface RadialGaugeThreshold {
  /** Value at which the marker sits, within `min`..`max`. */
  value: number;
  /** Semantic tone for the marker tick. Defaults to `warning`. */
  tone?: RadialGaugeTone;
  /** Optional short label describing the marker. */
  label?: string;
}

/**
 * An analog instrument dial for a bounded metric (utilization, score, capacity) —
 * the instrument-panel counterpart to `Meter`. A gold accent arc fills over an
 * aluminium track, with an optional pointer needle and optional threshold marks.
 * The fill animates on value change using precision easing and respects reduced motion.
 *
 * @example
 * <RadialGauge label="CPU" value={72} unit="%" thresholds={[{ value: 90, tone: "error" }]} />
 */
export interface RadialGaugeProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  /** Current value. */
  value: number;
  /** Minimum value (arc start). */
  min?: number;
  /** Maximum value (arc end). */
  max?: number;
  /** Accessible label, also shown beneath the dial. */
  label?: string;
  /** Unit suffix appended to the numeric readout (e.g. "%", "°"). */
  unit?: string;
  /** Show the numeric readout in the dial centre. Defaults to true. */
  showValue?: boolean;
  /** Render the pointer needle. Defaults to true. */
  needle?: boolean;
  /** Threshold markers rendered along the arc. */
  thresholds?: readonly RadialGaugeThreshold[];
  /** Overall dial size. */
  size?: "sm" | "md" | "lg";
}

/* ── Dial geometry (viewBox 120×120, centre 60,60) ── */
const VIEW = 120;
const CENTER = VIEW / 2;
const RADIUS = 46;
const NEEDLE_LENGTH = 40;
const HUB_RADIUS = 3.5;
const TICK_HALF = 5;
/** Arc sweeps 270°, leaving a 90° gap at the bottom. 0°=top, positive=clockwise. */
const START_ANGLE = 225;
const SWEEP = 270;
const END_ANGLE = START_ANGLE + SWEEP;

const SIZE_CLASS = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
} as const;

const TONE_CLASS = {
  accent: styles.toneAccent,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  error: styles.toneError,
} as const satisfies Record<RadialGaugeTone, string | undefined>;

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Project a polar angle (0°=top, clockwise) onto the dial's cartesian plane. */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): Point {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG path for a clockwise arc between two angles at a fixed radius. */
function describeArc(cx: number, cy: number, r: number, start: number, end: number): string {
  const from = polarToCartesian(cx, cy, r, start);
  const to = polarToCartesian(cx, cy, r, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${r} ${r} 0 ${largeArc} 1 ${to.x} ${to.y}`;
}

/** Clamp a raw value to its 0..1 position within the range. Zero range → 0. */
function toFraction(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, (value - min) / range));
}

export const RadialGauge = forwardRef<HTMLDivElement, RadialGaugeProps>(
  (
    {
      value,
      min = 0,
      max = 100,
      label,
      unit = "",
      showValue = true,
      needle = true,
      thresholds,
      size = "md",
      className,
      ...props
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const fraction = toFraction(value, min, max);
    const valueAngle = START_ANGLE + fraction * SWEEP;

    const trackPath = describeArc(CENTER, CENTER, RADIUS, START_ANGLE, END_ANGLE);
    const needleTip = polarToCartesian(CENTER, CENTER, NEEDLE_LENGTH, valueAngle);

    // Normalized dash reveal: pathLength=1 with a "1 1" dash pattern means an
    // offset of (1 - fraction) draws exactly `fraction` of the arc from the start.
    const revealOffset = 1 - fraction;
    const transition = shouldReduceMotion ? { duration: 0 } : precision;

    return (
      <div
        ref={ref}
        className={cn(styles.wrapper, SIZE_CLASS[size], className)}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={label}
        data-reduced-motion={shouldReduceMotion ? "true" : "false"}
        {...props}
      >
        <div className={styles.dial}>
          <svg
            className={styles.svg}
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <path className={styles.track} d={trackPath} fill="none" />
            <motion.path
              className={styles.valueArc}
              d={trackPath}
              fill="none"
              pathLength={1}
              strokeDasharray="1 1"
              data-fill-fraction={fraction}
              initial={{ strokeDashoffset: shouldReduceMotion ? revealOffset : 1 }}
              animate={{ strokeDashoffset: revealOffset }}
              transition={transition}
            />
            {thresholds?.map((threshold, index) => {
              const angle = START_ANGLE + toFraction(threshold.value, min, max) * SWEEP;
              const inner = polarToCartesian(CENTER, CENTER, RADIUS - TICK_HALF, angle);
              const outer = polarToCartesian(CENTER, CENTER, RADIUS + TICK_HALF, angle);
              return (
                <line
                  key={`${threshold.value}-${index}`}
                  className={cn(styles.threshold, TONE_CLASS[threshold.tone ?? "warning"])}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                />
              );
            })}
            {needle && (
              <g>
                <line
                  className={styles.needle}
                  x1={CENTER}
                  y1={CENTER}
                  x2={needleTip.x}
                  y2={needleTip.y}
                />
                <circle className={styles.needleHub} cx={CENTER} cy={CENTER} r={HUB_RADIUS} />
              </g>
            )}
          </svg>
          {showValue && (
            <div className={styles.readout}>
              <span className={styles.value}>
                {Math.round(value)}
                {unit}
              </span>
            </div>
          )}
        </div>
        {label && <span className={styles.label}>{label}</span>}
      </div>
    );
  }
);

RadialGauge.displayName = "RadialGauge";
