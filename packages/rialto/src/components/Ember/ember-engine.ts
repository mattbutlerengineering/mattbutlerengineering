import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import {
  draftPush,
  fadeAlpha,
  flicker,
  isGoldSpark,
  riseProgress,
  sparkSeed,
  SPARK_COUNT,
  SWAY_SPAN,
  swayOffset,
  type SparkSeed,
} from "./ember-spark";

/** Fraction of the remaining draft displacement closed each frame. */
const DRAFT_EASE = 0.12;

const SEEDS: readonly SparkSeed[] = Array.from({ length: SPARK_COUNT }, (_, i) => sparkSeed(i));

const INK_ALPHA = { dark: 0.5, light: 0.38 } as const;
const GOLD_ALPHA = { dark: 0.95, light: 0.85 } as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly ink: string;
  readonly inkAlpha: number;
  readonly goldAlpha: number;
}

/**
 * Starts the ember animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the spark drawing.
 */
export function startEmber(canvas: HTMLCanvasElement): () => void {
  let width = 0;
  let height = 0;
  let time = 0;
  /**
   * Eased draft displacement per spark. Mutated in place: a private buffer in
   * the render loop's closure, never observable from React.
   */
  const draftX = new Float32Array(SPARK_COUNT);
  const draftY = new Float32Array(SPARK_COUNT);

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
  }

  function drawSpark(
    ctx: CanvasRenderingContext2D,
    index: number,
    alphaScale: number,
    pointer: AmbientFrame<Palette>["pointer"]
  ) {
    const seed = SEEDS[index];
    if (!seed) return;
    const progress = riseProgress(seed, time);
    const baseX = (seed.x + swayOffset(seed, progress) * SWAY_SPAN) * width;
    const baseY = height * (1 - progress);

    const push = draftPush(baseX, baseY, pointer.x, pointer.y);
    draftX[index] = (draftX[index] ?? 0) + (push.x - (draftX[index] ?? 0)) * DRAFT_EASE;
    draftY[index] = (draftY[index] ?? 0) + (push.y - (draftY[index] ?? 0)) * DRAFT_EASE;

    ctx.globalAlpha = alphaScale * fadeAlpha(progress) * flicker(seed, time);
    ctx.beginPath();
    ctx.arc(
      baseX + (draftX[index] ?? 0),
      baseY + (draftY[index] ?? 0),
      seed.radius,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  function onFrame({ ctx, palette, pointer }: AmbientFrame<Palette>) {
    // Opaque every frame: sparks are points, not streaks, so no trails.
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    time += 1 / 60;

    // Two colour passes keep it to two fillStyle changes; gold is drawn last, on top.
    ctx.fillStyle = palette.ink;
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (!isGoldSpark(i)) drawSpark(ctx, i, palette.inkAlpha, pointer);
    }
    ctx.fillStyle = palette.accent;
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (isGoldSpark(i)) drawSpark(ctx, i, palette.goldAlpha, pointer);
    }
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
    inkAlpha: isDark ? INK_ALPHA.dark : INK_ALPHA.light,
    goldAlpha: isDark ? GOLD_ALPHA.dark : GOLD_ALPHA.light,
  };
}
