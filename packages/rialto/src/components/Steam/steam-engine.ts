import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import {
  createRandom,
  createWisps,
  envelope,
  GROWTH,
  spawnWisp,
  sway,
  TIER_COUNT,
  TIER_GOLD,
  wispCount,
  wispTier,
  type Wisps,
} from "./steam-field";

const SEED = 20261123;
const FULL_CIRCLE = Math.PI * 2;

/** Wisp alpha per tier: faint, softer, thicker ink, then gold. Large and low contrast. */
const TIER_ALPHA = {
  dark: [0.025, 0.055, 0.09, 0.1],
  light: [0.02, 0.045, 0.075, 0.09],
} as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly ink: string;
  readonly tierAlpha: readonly number[];
}

/**
 * Starts the steam animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the wisps. The
 * frame loop works over preallocated typed arrays and four batched fills, so it
 * allocates nothing per wisp and does a bounded amount of work per frame.
 */
export function startSteam(canvas: HTMLCanvasElement): () => void {
  const random = createRandom(SEED);
  let width = 0;
  let height = 0;
  let wisps: Wisps = createWisps(0);
  let tiers = new Uint8Array(0);
  let levels = new Float32Array(0);

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
    wisps = createWisps(wispCount(width, height));
    tiers = new Uint8Array(wisps.count);
    levels = new Float32Array(wisps.count);
    for (let i = 0; i < wisps.count; i++) spawnWisp(wisps, i, width, height, random, true);
  }

  function advance() {
    for (let i = 0; i < wisps.count; i++) {
      wisps.y[i] = (wisps.y[i] ?? 0) - (wisps.rise[i] ?? 0);
      wisps.swayPhase[i] = (wisps.swayPhase[i] ?? 0) + (wisps.swayRate[i] ?? 0);
      const life = (wisps.life[i] ?? 0) + (wisps.age[i] ?? 0);
      if (life >= 1) spawnWisp(wisps, i, width, height, random, false);
      else wisps.life[i] = life;
    }
  }

  function fillTier(ctx: CanvasRenderingContext2D, tier: number, palette: Palette) {
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < wisps.count; i++) {
      if (tiers[i] !== tier) continue;
      any = true;
      const life = wisps.life[i] ?? 0;
      const x = (wisps.x[i] ?? 0) + sway(wisps.swayPhase[i] ?? 0) * (wisps.swayReach[i] ?? 0);
      const y = wisps.y[i] ?? 0;
      const r = (wisps.radius[i] ?? 0) * (1 + GROWTH * life);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, FULL_CIRCLE);
    }
    if (!any) return;
    ctx.globalAlpha = palette.tierAlpha[tier] ?? 1;
    ctx.fillStyle = tier === TIER_GOLD ? palette.accent : palette.ink;
    ctx.fill();
  }

  function onFrame({ ctx, palette }: AmbientFrame<Palette>) {
    // Opaque every frame: no trails; the softness is overlap, not smear.
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    advance();
    for (let i = 0; i < wisps.count; i++) {
      const level = envelope(wisps.life[i] ?? 0);
      levels[i] = level;
      tiers[i] = wispTier(i, level);
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
