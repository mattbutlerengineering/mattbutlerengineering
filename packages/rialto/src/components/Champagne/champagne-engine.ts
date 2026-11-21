import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import {
  bubbleCount,
  createBubbles,
  createRandom,
  isGoldBubble,
  pointerPush,
  spawnBubble,
  swayOffset,
  type Bubbles,
} from "./champagne-field";

/** Fraction of the remaining pointer shove closed each frame. */
const POINTER_EASE = 0.08;
const SEED = 20261121;
const FULL_CIRCLE = Math.PI * 2;

interface LineStyle {
  readonly alpha: number;
  readonly width: number;
}

const GOLD_STYLE = {
  dark: { alpha: 0.7, width: 1.3 },
  light: { alpha: 0.6, width: 1.3 },
} as const;

const INK_STYLE = {
  dark: { alpha: 0.3, width: 0.9 },
  light: { alpha: 0.24, width: 0.9 },
} as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly ink: string;
  readonly goldStyle: LineStyle;
  readonly inkStyle: LineStyle;
}

/**
 * Starts the champagne animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the bubbles. The
 * frame loop works over preallocated typed arrays and two batched paths, so it
 * allocates nothing per bubble and does a bounded amount of work per frame.
 */
export function startChampagne(canvas: HTMLCanvasElement): () => void {
  const random = createRandom(SEED);
  let width = 0;
  let height = 0;
  let bubbles: Bubbles = createBubbles(0);

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
    bubbles = createBubbles(bubbleCount(width, height));
    for (let i = 0; i < bubbles.count; i++) {
      spawnBubble(bubbles, i, width, height, random, true);
    }
  }

  /** Bubble `i`'s column before the pointer shove: its lane plus the wobble. */
  function laneOf(i: number): number {
    return (bubbles.x[i] ?? 0) + swayOffset(bubbles.phase[i] ?? 0, bubbles.y[i] ?? 0);
  }

  /** Bubble `i`'s drawn column. */
  function columnOf(i: number): number {
    return laneOf(i) + (bubbles.push[i] ?? 0);
  }

  function advance(pointer: Readonly<{ x: number; y: number }>) {
    for (let i = 0; i < bubbles.count; i++) {
      const y = (bubbles.y[i] ?? 0) - (bubbles.speed[i] ?? 0);
      bubbles.y[i] = y;
      if (y < -(bubbles.radius[i] ?? 0)) {
        spawnBubble(bubbles, i, width, height, random, false);
        continue;
      }
      const target = pointerPush(laneOf(i) - pointer.x, y - pointer.y);
      bubbles.push[i] = (bubbles.push[i] ?? 0) + (target - (bubbles.push[i] ?? 0)) * POINTER_EASE;
    }
  }

  function strokeBubbles(
    ctx: CanvasRenderingContext2D,
    gold: boolean,
    color: string,
    style: LineStyle
  ) {
    ctx.globalAlpha = style.alpha;
    ctx.lineWidth = style.width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i < bubbles.count; i++) {
      if (isGoldBubble(i) !== gold) continue;
      const x = columnOf(i);
      const r = bubbles.radius[i] ?? 0;
      ctx.moveTo(x + r, bubbles.y[i] ?? 0);
      ctx.arc(x, bubbles.y[i] ?? 0, r, 0, FULL_CIRCLE);
    }
    ctx.stroke();
  }

  function onFrame({ ctx, palette, pointer }: AmbientFrame<Palette>) {
    // Opaque every frame: crisp bubbles, no trails.
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    advance(pointer);
    strokeBubbles(ctx, false, palette.ink, palette.inkStyle);
    strokeBubbles(ctx, true, palette.accent, palette.goldStyle);
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
    goldStyle: isDark ? GOLD_STYLE.dark : GOLD_STYLE.light,
    inkStyle: isDark ? INK_STYLE.dark : INK_STYLE.light,
  };
}
