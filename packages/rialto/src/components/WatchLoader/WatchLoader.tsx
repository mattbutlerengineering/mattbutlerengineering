import { forwardRef, useMemo, type CSSProperties, type HTMLAttributes } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../utils/class-composer";
import styles from "./WatchLoader.module.css";
import { ESCAPE_TEETH, MOVEMENT, PLATE_RADIUS, ROTOR_RADIUS, toothLength } from "./movement";

/**
 * Loader styled after the exhibition caseback of a mechanical automatic watch:
 * a sweeping rotor, a meshing gear train, an oscillating balance wheel, a ticking
 * escape wheel, and ruby jewels at the pivots. The metaphor is *precision in
 * motion* — an indeterminate "working" indicator with no progress semantics.
 *
 * Every moving part is driven by a CSS keyframe on a transform, so the whole
 * movement runs on the compositor thread with no JS timers.
 *
 * @example
 * <WatchLoader aria-label="Loading results" />
 * <WatchLoader aria-label="Saving" size="lg" variant="gold" speed="fast" />
 */
export interface WatchLoaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "aria-label"> {
  /** Accessible name — required because the component renders as role="img". */
  "aria-label": string;
  /** Preset (48 / 80 / 120px) or a raw pixel number. @default "md" */
  size?: "sm" | "md" | "lg" | number;
  /** Scales every animation duration proportionally. @default "normal" */
  speed?: "slow" | "normal" | "fast";
  /** Metallic finish — flips CSS custom properties only. @default "default" */
  variant?: "default" | "gold" | "steel" | "rose";
}

const CYCLE_BY_SPEED = { slow: "4s", normal: "2s", fast: "1s" } as const;

const SIZE_CLASS = { sm: styles.sizeSm, md: styles.sizeMd, lg: styles.sizeLg } as const;
const VARIANT_CLASS = {
  default: styles.variantDefault,
  gold: styles.variantGold,
  steel: styles.variantSteel,
  rose: styles.variantRose,
} as const;

const { balance, centerWheel, thirdWheel, fourthWheel, escapeWheel } = MOVEMENT;

export const WatchLoader = forwardRef<HTMLDivElement, WatchLoaderProps>(
  (
    {
      "aria-label": ariaLabel,
      size = "md",
      speed = "normal",
      variant = "default",
      className,
      style,
      ...rest
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion() ?? false;

    const isPreset = typeof size === "string";
    const sizeClass = isPreset ? SIZE_CLASS[size] : "";

    const rootClass = cn(
      styles.watchLoader,
      sizeClass,
      VARIANT_CLASS[variant],
      shouldReduceMotion && styles.reduced,
      className
    );

    const rootStyle = {
      "--watch-cycle": CYCLE_BY_SPEED[speed],
      ...(isPreset ? {} : { width: `${size}px`, height: `${size}px` }),
      ...style,
    } as CSSProperties;

    return (
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        data-reduced-motion={shouldReduceMotion}
        className={rootClass}
        style={rootStyle}
        {...rest}
      >
        <svg
          className={styles.svg}
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="watch-plate" cx="38%" cy="32%" r="80%">
              <stop offset="0%" stopColor="var(--watch-plate-hi)" />
              <stop offset="100%" stopColor="var(--watch-plate-lo)" />
            </radialGradient>
          </defs>

          {/* 1 · Main plate with a metal bezel */}
          <circle cx="50" cy="50" r={PLATE_RADIUS} className={styles.plate} />

          {/* 2 · Bridges — balance cock (left) and train bridge (right) */}
          <path
            className={styles.bridge}
            d="M 12 24 Q 16 16 24 18 L 40 34 Q 42 40 36 40 L 18 32 Z"
          />
          <path
            className={styles.bridge}
            d="M 70 26 Q 86 34 84 54 Q 82 72 70 78 L 62 70 Q 70 62 70 50 Q 68 38 60 32 Z"
          />

          {/* 3 · Gear train — tooth counts set the angular-velocity ratios */}
          <Gear part={centerWheel} className={styles.gearLarge} />
          <Gear part={thirdWheel} className={styles.gearMedium} />
          <Gear part={fourthWheel} className={styles.gearSmall} />

          {/* 4 · Escape wheel — advances one tooth per balance beat */}
          <g transform={`translate(${escapeWheel.cx},${escapeWheel.cy})`}>
            <g className={styles.escape}>
              <EscapeWheel teeth={ESCAPE_TEETH} radius={escapeWheel.radius} />
            </g>
          </g>

          {/* 5 · Balance wheel — oscillates under the balance cock */}
          <g transform={`translate(${balance.cx},${balance.cy})`}>
            <g className={styles.balance}>
              <circle r={balance.radius} className={styles.balanceRim} />
              <circle r={balance.radius * 0.7} className={styles.balanceRim} />
              <line
                x1={-balance.radius}
                y1="0"
                x2={balance.radius}
                y2="0"
                className={styles.spoke}
              />
              <line
                x1="0"
                y1={-balance.radius}
                x2="0"
                y2={balance.radius}
                className={styles.spoke}
              />
              <circle r={balance.radius * 0.18} className={styles.gearHub} />
            </g>
          </g>

          {/* 6 · Jewels — ruby pivots */}
          {Object.values(MOVEMENT).map((part) => (
            <Jewel key={part.id} cx={part.cx} cy={part.cy} />
          ))}

          {/* 7 · Rotor — sweeps over everything. The bearing race keeps the
              group's bounding box symmetric, so `transform-box: fill-box`
              rotates it about the pivot rather than the half-annulus' centroid. */}
          <g transform="translate(50,50)">
            <g className={styles.rotor} data-part="rotor">
              <circle r={ROTOR_RADIUS} className={styles.rotorRace} data-part="rotor-race" />
              <path
                className={styles.rotorBody}
                d={`M ${-ROTOR_RADIUS} 0 A ${ROTOR_RADIUS} ${ROTOR_RADIUS} 0 0 1 ${ROTOR_RADIUS} 0 L 34 0 A 34 34 0 0 0 -34 0 Z`}
              />
              <rect
                className={styles.rotorWeight}
                x={-ROTOR_RADIUS}
                y="-6"
                width="14"
                height="12"
                rx="3"
              />
            </g>
          </g>

          {/* 8 · Rotor hub and pivot jewel */}
          <circle cx="50" cy="50" r="4.5" className={styles.rotorHub} />
          <Jewel cx={50} cy={50} r={2.2} />
        </svg>
      </div>
    );
  }
);

WatchLoader.displayName = "WatchLoader";

/* ── Gear ──────────────────────────────────────── */

interface GearProps {
  part: (typeof MOVEMENT)["centerWheel" | "thirdWheel" | "fourthWheel"];
  className: string | undefined;
}

/**
 * A toothed wheel at the part's position. The outer group sets the position
 * via the SVG transform attribute; the inner, animated group spins around its
 * own centre (`transform-box: fill-box`) so the CSS rotate animation never
 * clobbers the positioning translate.
 */
function Gear({ part, className }: GearProps) {
  const { cx, cy, teeth, radius } = part;
  const toothPositions = useMemo(
    () => Array.from({ length: teeth }, (_, i) => (i * 360) / teeth),
    [teeth]
  );
  const length = toothLength(radius);
  const width = radius * 0.22;

  return (
    <g transform={`translate(${cx},${cy})`}>
      <g className={className}>
        {toothPositions.map((angle) => (
          <rect
            key={angle}
            className={styles.gearTooth}
            x={-width / 2}
            y={-radius - length}
            width={width}
            height={length + 2}
            rx={width * 0.3}
            transform={`rotate(${angle})`}
          />
        ))}
        <circle r={radius} className={styles.gearBody} />
        <circle r={radius * 0.32} className={styles.gearHub} />
      </g>
    </g>
  );
}

/* ── Escape wheel ──────────────────────────────── */

function EscapeWheel({ teeth, radius }: { teeth: number; radius: number }) {
  const points = useMemo(() => {
    const verts: string[] = [];
    for (let i = 0; i < teeth; i += 1) {
      const a0 = (i * 2 * Math.PI) / teeth;
      const a1 = ((i + 0.5) * 2 * Math.PI) / teeth;
      verts.push(`${Math.cos(a0) * radius},${Math.sin(a0) * radius}`);
      verts.push(`${Math.cos(a1) * radius * 0.62},${Math.sin(a1) * radius * 0.62}`);
    }
    return verts.join(" ");
  }, [teeth, radius]);

  return (
    <>
      {/* Symmetric bounds so the odd-toothed polygon ticks about its own axle. */}
      <circle r={radius} className={styles.axleRace} />
      <polygon points={points} className={styles.escapeBody} />
      <circle r={radius * 0.3} className={styles.gearHub} />
    </>
  );
}

/* ── Jewel ─────────────────────────────────────── */

function Jewel({ cx, cy, r = 1.8 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} className={styles.jewel} />;
}
