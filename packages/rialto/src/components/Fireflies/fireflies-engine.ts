import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import {
  createFlies,
  createRandom,
  flyCount,
  flyTier,
  pullFraction,
  pulseLevel,
  spawnFly,
  TIER_COUNT,
  TIER_GOLD,
  turnRate,
  WANDER_RATE,
  WRAP_MARGIN,
  wrap,
  type Flies,
} from "./fireflies-field";

/** Fraction of the remaining pointer pull closed each frame. */
const POINTER_EASE = 0.04;
const SEED = 20261122;
const FULL_CIRCLE = Math.PI * 2;

/** Fly alpha per tier: dim, mid, bright ink, then gold. */
const TIER_ALPHA = {
  dark: [0.12, 0.35, 0.7, 0.92],
  light: [0.1, 0.28, 0.55, 0.85],
} as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly ink: string;
  readonly tierAlpha: readonly number[];
}

/**
 * Starts the fireflies animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the flies. The
 * frame loop works over preallocated typed arrays and four batched fills, so it
 * allocates nothing per fly and does a bounded amount of work per frame.
 */
export function startFireflies(canvas: HTMLCanvasElement): () => void {
  const random = createRandom(SEED);
  let width = 0;
  let height = 0;
  let flies: Flies = createFlies(0);
  let tiers = new Uint8Array(0);
  let levels = new Float32Array(0);

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
    flies = createFlies(flyCount(width, height));
    tiers = new Uint8Array(flies.count);
    levels = new Float32Array(flies.count);
    for (let i = 0; i < flies.count; i++) spawnFly(flies, i, width, height, random);
  }

  function advance(pointer: Readonly<{ x: number; y: number }>) {
    for (let i = 0; i < flies.count; i++) {
      const wander = (flies.wander[i] ?? 0) + WANDER_RATE;
      flies.wander[i] = wander;
      const heading = (flies.heading[i] ?? 0) + turnRate(wander);
      flies.heading[i] = heading;
      const speed = flies.speed[i] ?? 0;
      flies.x[i] = wrap((flies.x[i] ?? 0) + Math.cos(heading) * speed, width, WRAP_MARGIN);
      flies.y[i] = wrap((flies.y[i] ?? 0) + Math.sin(heading) * speed, height, WRAP_MARGIN);
      flies.phase[i] = (flies.phase[i] ?? 0) + (flies.rate[i] ?? 0);

      // Ease towards a point part of the way to the pointer; relax back when it is far.
      const dx = pointer.x - (flies.x[i] ?? 0);
      const dy = pointer.y - (flies.y[i] ?? 0);
      const fraction = pullFraction(Math.hypot(dx, dy));
      const targetX = Number.isFinite(dx) ? dx * fraction : 0;
      const targetY = Number.isFinite(dy) ? dy * fraction : 0;
      flies.pullX[i] = (flies.pullX[i] ?? 0) + (targetX - (flies.pullX[i] ?? 0)) * POINTER_EASE;
      flies.pullY[i] = (flies.pullY[i] ?? 0) + (targetY - (flies.pullY[i] ?? 0)) * POINTER_EASE;
    }
  }

  function fillTier(ctx: CanvasRenderingContext2D, tier: number, palette: Palette) {
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < flies.count; i++) {
      if (tiers[i] !== tier) continue;
      any = true;
      const x = (flies.x[i] ?? 0) + (flies.pullX[i] ?? 0);
      const y = (flies.y[i] ?? 0) + (flies.pullY[i] ?? 0);
      const r = (flies.radius[i] ?? 0) * (0.7 + 0.5 * (levels[i] ?? 0));
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, FULL_CIRCLE);
    }
    if (!any) return;
    ctx.globalAlpha = palette.tierAlpha[tier] ?? 1;
    ctx.fillStyle = tier === TIER_GOLD ? palette.accent : palette.ink;
    ctx.fill();
  }

  function onFrame({ ctx, palette, pointer }: AmbientFrame<Palette>) {
    // Opaque every frame: crisp flies, no trails.
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    advance(pointer);
    for (let i = 0; i < flies.count; i++) {
      const level = pulseLevel(flies.phase[i] ?? 0);
      levels[i] = level;
      tiers[i] = flyTier(i, level);
    }
    for (let tier = 0; tier < TIER_COUNT; tier++) fillTier(ctx, tier, palette);
  }

  return startAmbientCanvas(canvas, { readPalette, onResize, onFrame });
}

/**
 * Resolves the live theme tokens. Read off the canvas so the cascade applies,
 * and re-read whenever `data-theme` flips — no color is ever hardcoded.
 */
function readPalette(element: Element): Palette {
  const computed = getComputedStyle(element);
  // Nearest theme scope, not the root — nested light and dark samples each
  // honour the scope they sit in.
  const isDark = element.closest("[data-theme]")?.getAttribute("data-theme") === "dark";
  return {
    surface: computed.getPropertyValue("--rialto-surface").trim(),
    accent: computed.getPropertyValue("--rialto-accent").trim(),
    ink: computed.getPropertyValue("--rialto-text-primary").trim(),
    tierAlpha: TIER_ALPHA[isDark ? "dark" : "light"],
  };
}
