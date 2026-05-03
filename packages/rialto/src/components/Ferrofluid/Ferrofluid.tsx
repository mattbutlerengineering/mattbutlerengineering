import { forwardRef, useId, useMemo, type HTMLAttributes } from "react";
import { motion, useReducedMotion } from "framer-motion";
import styles from "./Ferrofluid.module.css";

/**
 * A decorative ferrofluid-style fluid animation. Several SVG circles drift
 * through a container; an SVG `feGaussianBlur` + `feColorMatrix` filter fuses
 * any overlapping circles into continuous blobs, producing the liquid
 * surface-tension effect of magnetic fluid.
 *
 * Purely decorative — always `aria-hidden`. If you need it to convey meaning,
 * wrap it and add your own semantics in the parent.
 *
 * @example
 * <div className="hero-background">
 *   <Ferrofluid color="var(--rialto-accent)" blobCount={5} />
 * </div>
 */
export interface FerrofluidProps extends HTMLAttributes<HTMLDivElement> {
  /** Fill color for the blobs. @default "var(--rialto-accent)" */
  color?: string;
  /** How many blobs to render. @default 5 */
  blobCount?: number;
  /** Drift speed preset. @default "slow" */
  speed?: "slow" | "medium" | "fast";
  /** Blur intensity. Higher = more liquid/merged. @default 12 */
  blurAmount?: number;
}

const SPEED_DURATION = {
  slow: 18,
  medium: 12,
  fast: 8,
} as const;

export const Ferrofluid = forwardRef<HTMLDivElement, FerrofluidProps>(
  (
    {
      color = "var(--rialto-accent)",
      blobCount = 5,
      speed = "slow",
      blurAmount = 12,
      className,
      ...rest
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const filterId = useId();
    const duration = SPEED_DURATION[speed];

    // Seeded per-instance layout — deterministic once blobCount is set, so the
    // visual is stable across renders but randomized per instance on the page.
    const blobs = useMemo(() => generateBlobs(blobCount), [blobCount]);

    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={[styles.wrapper, className].filter(Boolean).join(" ")}
        {...rest}
      >
        <svg className={styles.svg} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          <defs>
            <filter id={filterId}>
              <feGaussianBlur in="SourceGraphic" stdDeviation={blurAmount} />
              <feColorMatrix
                values="1 0 0 0 0
                        0 1 0 0 0
                        0 0 1 0 0
                        0 0 0 24 -12"
              />
            </filter>
          </defs>

          <g filter={`url(#${filterId})`}>
            {blobs.map((blob, i) =>
              shouldReduceMotion ? (
                <circle key={i} cx={blob.cx} cy={blob.cy} r={blob.r} fill={color} />
              ) : (
                <motion.circle
                  key={i}
                  r={blob.r}
                  fill={color}
                  initial={{ cx: blob.cx, cy: blob.cy }}
                  animate={{
                    cx: [blob.cx, blob.cx + blob.dx, blob.cx - blob.dx / 2, blob.cx],
                    cy: [blob.cy, blob.cy - blob.dy, blob.cy + blob.dy / 2, blob.cy],
                  }}
                  transition={{
                    duration: duration + (i % 3) * 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.3,
                  }}
                />
              )
            )}
          </g>
        </svg>
      </div>
    );
  }
);

Ferrofluid.displayName = "Ferrofluid";

/* ── Deterministic blob generator ─────────── */

interface Blob {
  cx: number;
  cy: number;
  r: number;
  dx: number;
  dy: number;
}

function generateBlobs(count: number): Blob[] {
  // Use a mulberry32 PRNG with a seed derived from count so the layout is
  // reproducible but varies with configuration.
  let seed = count * 2654435761;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return Array.from({ length: count }, () => ({
    cx: 20 + rand() * 60,
    cy: 20 + rand() * 60,
    r: 8 + rand() * 14,
    dx: 8 + rand() * 12,
    dy: 8 + rand() * 12,
  }));
}
