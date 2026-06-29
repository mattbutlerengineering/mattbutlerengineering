import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { cn } from "../../utils/class-composer";
import styles from "./WatchLoader.module.css";

/**
 * Loader styled after the exhibition caseback of a mechanical automatic watch:
 * a sweeping rotor, a meshing gear train, an oscillating balance wheel, a ticking
 * escape wheel, and ruby jewels at the pivots. The metaphor is *precision in
 * motion* — an indeterminate "working" indicator with no progress semantics.
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

/* ── Movement geometry (viewBox is 100×100, center at 50,50) ── */
const BALANCE_AMPLITUDE = 26; // degrees the balance wheel swings each way
const ESCAPE_TEETH = 15;
const ESCAPE_TOOTH_ANGLE = 360 / ESCAPE_TEETH; // one tick per balance beat

const CYCLE_BY_SPEED = { slow: "4s", normal: "2s", fast: "1s" } as const;
const BEAT_MS_BY_SPEED = { slow: 700, normal: 420, fast: 240 } as const;

const SIZE_CLASS = { sm: styles.sizeSm, md: styles.sizeMd, lg: styles.sizeLg } as const;
const VARIANT_CLASS = {
  default: styles.variantDefault,
  gold: styles.variantGold,
  steel: styles.variantSteel,
  rose: styles.variantRose,
} as const;

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

    // Balance wheel: spring-physics oscillation. Escape wheel: discrete ticks.
    // Both are framer-motion MotionValues, so the driving interval mutates them
    // via `.set()` — never React state — keeping us clear of the rialto
    // setState-in-effect ban and avoiding re-render churn.
    const balanceRotation = useSpring(0, { stiffness: 80, damping: 8 });
    const escapeRotation = useMotionValue(0);
    const escapeAccumRef = useRef(0);

    const beatMs = BEAT_MS_BY_SPEED[speed];

    useEffect(() => {
      if (shouldReduceMotion) return;
      let direction = 1;
      const id = setInterval(() => {
        direction = -direction;
        balanceRotation.set(direction * BALANCE_AMPLITUDE);
        escapeAccumRef.current += ESCAPE_TOOTH_ANGLE;
        escapeRotation.set(escapeAccumRef.current);
      }, beatMs);
      return () => clearInterval(id);
    }, [shouldReduceMotion, beatMs, balanceRotation, escapeRotation]);

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

          {/* 1 · Background plate */}
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="url(#watch-plate)"
            stroke="var(--watch-bridge)"
            strokeWidth="1"
          />

          {/* 2 · Bridges (structural plates) */}
          <path className={styles.bridge} d="M 18 30 Q 50 14 82 34 L 78 44 Q 50 26 24 40 Z" />
          <path className={styles.bridge} d="M 60 58 Q 80 60 84 80 L 74 82 Q 70 66 56 66 Z" />

          {/* 3 · Gear train — tooth counts set the angular-velocity ratios */}
          <Gear cx={32} cy={56} teeth={12} radius={15} className={styles.gearLarge} />
          <Gear cx={56} cy={62} teeth={8} radius={10} className={styles.gearMedium} />
          <Gear cx={72} cy={50} teeth={6} radius={7.5} className={styles.gearSmall} />

          {/* 4 · Escape wheel — advances one tooth per balance beat */}
          <g transform="translate(70,72)">
            <motion.g className={styles.escape} style={{ rotate: escapeRotation }}>
              <EscapeWheel teeth={ESCAPE_TEETH} radius={9} />
            </motion.g>
          </g>

          {/* 5 · Balance wheel — spring-driven oscillation */}
          <g transform="translate(50,50)">
            <motion.g className={styles.balance} style={{ rotate: balanceRotation }}>
              <circle r="16" className={styles.balanceRim} />
              <circle r="11" className={styles.balanceRim} />
              <line x1="-16" y1="0" x2="16" y2="0" className={styles.spoke} />
              <line x1="0" y1="-16" x2="0" y2="16" className={styles.spoke} />
            </motion.g>
          </g>

          {/* 6 · Jewels — ruby pivots */}
          <Jewel cx={32} cy={56} />
          <Jewel cx={56} cy={62} />
          <Jewel cx={72} cy={50} />
          <Jewel cx={70} cy={72} />
          <Jewel cx={50} cy={50} />

          {/* 7 · Rotor — sweeps over everything */}
          <g transform="translate(50,50)">
            <g className={styles.rotor}>
              <path
                className={styles.rotorBody}
                d="M -44 0 A 44 44 0 0 1 44 0 L 30 0 A 30 30 0 0 0 -30 0 Z"
              />
              <rect className={styles.rotorWeight} x="-44" y="-6" width="14" height="12" rx="3" />
            </g>
          </g>

          {/* 8 · Rotor pivot jewel */}
          <Jewel cx={50} cy={50} r={2.4} />
        </svg>
      </div>
    );
  }
);

WatchLoader.displayName = "WatchLoader";

/* ── Gear ──────────────────────────────────────── */

interface GearProps {
  cx: number;
  cy: number;
  teeth: number;
  radius: number;
  className: string | undefined;
}

/**
 * A gear positioned at (cx, cy). The outer group sets the position via the SVG
 * transform attribute; the inner, animated group spins around its own centre
 * (`transform-box: fill-box`) so the CSS rotate animation never clobbers the
 * positioning translate.
 */
function Gear({ cx, cy, teeth, radius, className }: GearProps) {
  const toothPositions = useMemo(
    () => Array.from({ length: teeth }, (_, i) => (i * 360) / teeth),
    [teeth]
  );
  const toothLength = radius * 0.28;
  const toothWidth = radius * 0.22;

  return (
    <g transform={`translate(${cx},${cy})`}>
      <g className={className}>
        {toothPositions.map((angle) => (
          <rect
            key={angle}
            className={styles.gearTooth}
            x={-toothWidth / 2}
            y={-radius - toothLength}
            width={toothWidth}
            height={toothLength + 2}
            rx={toothWidth * 0.3}
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
      <polygon points={points} className={styles.escapeBody} />
      <circle r={radius * 0.3} className={styles.gearHub} />
    </>
  );
}

/* ── Jewel ─────────────────────────────────────── */

function Jewel({ cx, cy, r = 1.8 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} className={styles.jewel} />;
}
