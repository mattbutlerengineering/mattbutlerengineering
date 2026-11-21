import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import {
  buildRings,
  gcd,
  hypotrochoidPoint,
  hypotrochoidPeriod,
  ringCount,
  ringPhaseShift,
  type Ring,
} from "./guilloche-curves";

/** Rotation advance per frame, in radians (before each ring's own spin). */
const TIME_STEP = 0.0012;
/** Share of the remaining pointer phase shift absorbed each frame. */
const SHIFT_EASE = 0.08;
/** Line segments per closed lobe of a curve. */
const SEGMENTS_PER_LOBE = 120;
/** The rosette fills this share of the half short side. */
const FILL = 0.94;

interface LineStyle {
  readonly alpha: number;
  readonly width: number;
}

const GOLD_STYLE = {
  dark: { alpha: 0.5, width: 1.1 },
  light: { alpha: 0.4, width: 1.1 },
} as const;

const RING_STYLE = {
  dark: { alpha: 0.16, width: 0.8 },
  light: { alpha: 0.11, width: 0.8 },
} as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly ink: string;
  readonly goldStyle: LineStyle;
  readonly ringStyle: LineStyle;
}

/**
 * Starts the guilloche animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the rosette drawing.
 */
export function startGuilloche(canvas: HTMLCanvasElement): () => void {
  let rings: readonly Ring[] = [];
  /** Eased pointer phase shift per ring. Private buffer in the loop's closure. */
  let shifts: number[] = [];
  let width = 0;
  let height = 0;
  let time = 0;

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
    const maxRadius = (Math.min(width, height) / 2) * FILL;
    rings = buildRings(ringCount(width, height), maxRadius);
    shifts = rings.map(() => 0);
  }

  /** Traces one ring as a closed path centred on the canvas. */
  function tracePath(ctx: CanvasRenderingContext2D, ring: Ring, angle: number) {
    const lobes = ring.smallR / gcd(ring.bigR, ring.smallR);
    const steps = SEGMENTS_PER_LOBE * lobes;
    const period = hypotrochoidPeriod(ring.bigR, ring.smallR);
    const scale = ring.radius / (ring.bigR - ring.smallR + ring.offset);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let i = 0; i <= steps; i += 1) {
      const point = hypotrochoidPoint(ring, (i / steps) * period);
      const x = width / 2 + (point.x * cos - point.y * sin) * scale;
      const y = height / 2 + (point.x * sin + point.y * cos) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function strokeRings(
    ctx: CanvasRenderingContext2D,
    group: readonly number[],
    color: string,
    style: LineStyle
  ) {
    ctx.globalAlpha = style.alpha;
    ctx.lineWidth = style.width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const index of group) {
      const ring = rings[index];
      if (!ring) continue;
      tracePath(ctx, ring, ring.phase + time * ring.spin + (shifts[index] ?? 0));
    }
    ctx.stroke();
  }

  function easeShifts(pointer: AmbientFrame<Palette>["pointer"]) {
    const distance = Math.hypot(pointer.x - width / 2, pointer.y - height / 2);
    shifts = shifts.map((current, index) => {
      const target = ringPhaseShift(rings[index]?.radius ?? 0, distance);
      return current + (target - current) * SHIFT_EASE;
    });
  }

  function onFrame({ ctx, palette, pointer }: AmbientFrame<Palette>) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    time += TIME_STEP;
    easeShifts(pointer);

    ctx.lineJoin = "round";
    const indices = rings.map((_, index) => index);
    strokeRings(
      ctx,
      indices.filter((index) => !rings[index]?.gold),
      palette.ink,
      palette.ringStyle
    );
    strokeRings(
      ctx,
      indices.filter((index) => rings[index]?.gold),
      palette.accent,
      palette.goldStyle
    );
  }

  return startAmbientCanvas(canvas, { readPalette, onResize, onFrame });
}

/**
 * Resolves the live theme tokens. Read off the canvas so the cascade applies,
 * and re-read whenever `data-theme` flips — no color is ever hardcoded.
 */
function readPalette(element: Element): Palette {
  const computed = getComputedStyle(element);
  // Nearest theme scope, not the root — a page may nest a light and a dark
  // sample side by side, and each canvas should honour the scope it sits in.
  const isDark = element.closest("[data-theme]")?.getAttribute("data-theme") === "dark";
  return {
    surface: computed.getPropertyValue("--rialto-surface").trim(),
    accent: computed.getPropertyValue("--rialto-accent").trim(),
    ink: computed.getPropertyValue("--rialto-text-primary").trim(),
    goldStyle: isDark ? GOLD_STYLE.dark : GOLD_STYLE.light,
    ringStyle: isDark ? RING_STYLE.dark : RING_STYLE.light,
  };
}
