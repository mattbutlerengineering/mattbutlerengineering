import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import {
  curveSteps,
  GOLD_RING_INDEX,
  PHASE_STEP,
  pointerPhaseTarget,
  RINGS,
  ringRadius,
  ROTATION_STEP,
  rosettePoint,
  rosetteRadius,
  type RingSpec,
} from "./guilloche-curve";

/** Fraction of the remaining pointer phase shift closed each frame. */
const POINTER_EASE = 0.08;

interface LineStyle {
  readonly alpha: number;
  readonly width: number;
}

const GOLD_STYLE = {
  dark: { alpha: 0.6, width: 1.1 },
  light: { alpha: 0.5, width: 1.1 },
} as const;

const INK_STYLE = {
  dark: { alpha: 0.22, width: 0.7 },
  light: { alpha: 0.16, width: 0.7 },
} as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly ink: string;
  readonly goldStyle: LineStyle;
  readonly inkStyle: LineStyle;
}

/**
 * Starts the guilloche animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the rosette drawing.
 */
export function startGuilloche(canvas: HTMLCanvasElement): () => void {
  let width = 0;
  let height = 0;
  let outerRadius = 0;
  let time = 0;
  /**
   * Eased pointer phase shift per ring. Mutated in place: a private buffer in
   * the render loop's closure, never observable from React.
   */
  const pointerPhase: number[] = RINGS.map(() => 0);

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
    outerRadius = rosetteRadius(width, height);
  }

  function strokeRing(
    ctx: CanvasRenderingContext2D,
    index: number,
    ring: RingSpec,
    radius: number,
    color: string,
    style: LineStyle
  ) {
    // Alternate directions so neighbouring rings counter-drift against each other.
    const direction = index % 2 === 0 ? 1 : -1;
    const speed = 1 + index * 0.15;
    const phase = direction * time * PHASE_STEP * 60 * speed + (pointerPhase[index] ?? 0);
    const rotation = -direction * time * ROTATION_STEP * 60 * speed;
    const steps = curveSteps(ring.lobes);

    ctx.globalAlpha = style.alpha;
    ctx.lineWidth = style.width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let step = 0; step < steps; step++) {
      const point = rosettePoint(ring, (step / steps) * Math.PI * 2, phase, rotation);
      const x = width / 2 + point.x * radius;
      const y = height / 2 + point.y * radius;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  function onFrame({ ctx, palette, pointer }: AmbientFrame<Palette>) {
    // Opaque every frame: engraved lines, no trails.
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    time += 1 / 60;
    const pointerDistance = Math.hypot(pointer.x - width / 2, pointer.y - height / 2);

    RINGS.forEach((ring, index) => {
      const radius = ringRadius(index, outerRadius);
      const target = pointerPhaseTarget(pointerDistance, radius);
      pointerPhase[index] =
        (pointerPhase[index] ?? 0) + (target - (pointerPhase[index] ?? 0)) * POINTER_EASE;

      const isGold = index === GOLD_RING_INDEX;
      strokeRing(
        ctx,
        index,
        ring,
        radius,
        isGold ? palette.accent : palette.ink,
        isGold ? palette.goldStyle : palette.inkStyle
      );
    });
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
    inkStyle: isDark ? INK_STYLE.dark : INK_STYLE.light,
  };
}
