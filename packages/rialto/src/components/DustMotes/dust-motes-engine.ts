import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import {
  createMotes,
  createRandom,
  moteCount,
  moteTier,
  pointerPush,
  shaftGradientLine,
  shaftLight,
  spawnMote,
  swayOffset,
  TIER_COUNT,
  TIER_GOLD,
  type Motes,
} from "./dust-motes-field";

/** Fraction of the remaining pointer shove closed each frame. */
const POINTER_EASE = 0.06;
const SEED = 20261122;
const FULL_CIRCLE = Math.PI * 2;

/** Alpha of the shaft glow behind the motes. */
const GLOW_ALPHA = { dark: 0.1, light: 0.14 } as const;

/** Mote alpha per tier: dim, mid, lit ink, then gold. */
const TIER_ALPHA = {
  dark: [0.18, 0.36, 0.6, 0.85],
  light: [0.14, 0.28, 0.46, 0.8],
} as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly ink: string;
  readonly glowAlpha: number;
  readonly tierAlpha: readonly number[];
}

/**
 * Starts the dust-motes animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the motes. The
 * frame loop works over preallocated typed arrays and four batched fills, so it
 * allocates nothing per mote and does a bounded amount of work per frame.
 */
export function startDustMotes(canvas: HTMLCanvasElement): () => void {
  const random = createRandom(SEED);
  let width = 0;
  let height = 0;
  let motes: Motes = createMotes(0);
  let tiers = new Uint8Array(0);
  let glow: { palette: Palette; gradient: CanvasGradient } | null = null;

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
    motes = createMotes(moteCount(width, height));
    tiers = new Uint8Array(motes.count);
    glow = null;
    for (let i = 0; i < motes.count; i++) {
      spawnMote(motes, i, width, height, random, true);
    }
  }

  /** Mote `i`'s column before the pointer shove: its lane plus the wander. */
  function laneOf(i: number): number {
    return (motes.x[i] ?? 0) + swayOffset(motes.phase[i] ?? 0, motes.y[i] ?? 0);
  }

  /** Mote `i`'s drawn column. */
  function columnOf(i: number): number {
    return laneOf(i) + (motes.push[i] ?? 0);
  }

  function advance(pointer: Readonly<{ x: number; y: number }>) {
    for (let i = 0; i < motes.count; i++) {
      const y = (motes.y[i] ?? 0) + (motes.fall[i] ?? 0);
      motes.y[i] = y;
      if (y > height + (motes.radius[i] ?? 0)) {
        spawnMote(motes, i, width, height, random, false);
        continue;
      }
      let x = (motes.x[i] ?? 0) + (motes.drift[i] ?? 0);
      if (x < 0) x += width;
      else if (x > width) x -= width;
      motes.x[i] = x;
      const target = pointerPush(laneOf(i) - pointer.x, y - pointer.y);
      motes.push[i] = (motes.push[i] ?? 0) + (target - (motes.push[i] ?? 0)) * POINTER_EASE;
    }
  }

  function paintGlow(ctx: CanvasRenderingContext2D, palette: Palette) {
    if (glow?.palette !== palette) {
      const { x0, y0, x1, y1 } = shaftGradientLine(width, height);
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, palette.surface);
      gradient.addColorStop(0.5, palette.accent);
      gradient.addColorStop(1, palette.surface);
      glow = { palette, gradient };
    }
    ctx.globalAlpha = palette.glowAlpha;
    ctx.fillStyle = glow.gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function fillTier(ctx: CanvasRenderingContext2D, tier: number, palette: Palette) {
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < motes.count; i++) {
      if (tiers[i] !== tier) continue;
      any = true;
      const x = columnOf(i);
      const r = motes.radius[i] ?? 0;
      ctx.moveTo(x + r, motes.y[i] ?? 0);
      ctx.arc(x, motes.y[i] ?? 0, r, 0, FULL_CIRCLE);
    }
    if (!any) return;
    ctx.globalAlpha = palette.tierAlpha[tier] ?? 1;
    ctx.fillStyle = tier === TIER_GOLD ? palette.accent : palette.ink;
    ctx.fill();
  }

  function onFrame({ ctx, palette, pointer }: AmbientFrame<Palette>) {
    // Opaque every frame: crisp motes, no trails.
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    paintGlow(ctx, palette);
    advance(pointer);
    for (let i = 0; i < motes.count; i++) {
      tiers[i] = moteTier(i, shaftLight(columnOf(i), motes.y[i] ?? 0, width, height));
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
  const mode = isDark ? "dark" : "light";
  return {
    surface: computed.getPropertyValue("--rialto-surface").trim(),
    accent: computed.getPropertyValue("--rialto-accent").trim(),
    ink: computed.getPropertyValue("--rialto-text-primary").trim(),
    glowAlpha: GLOW_ALPHA[mode],
    tierAlpha: TIER_ALPHA[mode],
  };
}
