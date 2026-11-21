import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientPointer,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import {
  createValueNoise,
  FIELD_TIME_STEP,
  silkParticleCount,
  silkStrandAngle,
} from "./silk-flow-field";

/** Screen-space travel per frame, in CSS pixels. */
const SPEED = 1.4;
/** Opacity of the per-frame surface wash — lower means longer trails. */
const TRAIL_FADE_ALPHA = 0.055;
/** Every nth strand is gold. 20 keeps the jewel accent at a surgical 5%. */
const GOLD_EVERY_NTH = 20;
/** Pointer influence radius, in CSS pixels. */
const POINTER_RADIUS = 140;
/** Peak push applied at the pointer, tapering linearly to zero at the radius. */
const POINTER_PUSH = 2.4;

interface StrandStyle {
  readonly alpha: number;
  readonly width: number;
}

const GOLD_STYLE = {
  dark: { alpha: 0.5, width: 1.1 },
  light: { alpha: 0.4, width: 1.1 },
} as const;

const SILK_STYLE = {
  dark: { alpha: 0.16, width: 0.8 },
  light: { alpha: 0.11, width: 0.8 },
} as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly silk: string;
  readonly goldStyle: StrandStyle;
  readonly silkStyle: StrandStyle;
}

/**
 * A single strand: its current point and the point it came from.
 *
 * Mutated in place. This is a private buffer inside the render loop's closure —
 * never observable from React — and reallocating hundreds of objects per frame
 * at 60fps is the one place where copy-on-write is the wrong default.
 */
interface Strand {
  x: number;
  y: number;
  px: number;
  py: number;
}

/**
 * Starts the silk flow-field animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the strand physics.
 */
export function startSilkFlow(canvas: HTMLCanvasElement): () => void {
  const noise = createValueNoise();

  let strands: Strand[] = [];
  let silkStrands: Strand[] = [];
  let goldStrands: Strand[] = [];
  let width = 0;
  let height = 0;
  let time = 0;
  /** The first frame paints an opaque wash so trails fade in from the surface. */
  let washed = false;

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
    strands = Array.from({ length: silkParticleCount(width, height) }, () =>
      respawn({ x: 0, y: 0, px: 0, py: 0 })
    );
    goldStrands = strands.filter((_, index) => index % GOLD_EVERY_NTH === 0);
    silkStrands = strands.filter((_, index) => index % GOLD_EVERY_NTH !== 0);
    washed = false;
  }

  /** Moves a strand to a fresh random position, leaving no trailing segment. */
  function respawn(strand: Strand): Strand {
    strand.x = Math.random() * width;
    strand.y = Math.random() * height;
    strand.px = strand.x;
    strand.py = strand.y;
    return strand;
  }

  function advance(strand: Strand, pointer: Readonly<AmbientPointer>) {
    const angle = silkStrandAngle(noise, strand.x, strand.y, time);
    let vx = Math.cos(angle) * SPEED;
    let vy = Math.sin(angle) * SPEED;

    const dx = strand.x - pointer.x;
    const dy = strand.y - pointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0 && distance < POINTER_RADIUS) {
      const push = (1 - distance / POINTER_RADIUS) * POINTER_PUSH;
      vx += (dx / distance) * push;
      vy += (dy / distance) * push;
    }

    strand.px = strand.x;
    strand.py = strand.y;
    strand.x += vx;
    strand.y += vy;

    // Respawning collapses the segment to a point, which `strokeGroup` skips —
    // that is what stops a trail being drawn across the jump.
    if (strand.x < 0 || strand.x > width || strand.y < 0 || strand.y > height) respawn(strand);
  }

  /** Draws one batch of strands as a single path — one style change per frame. */
  function strokeGroup(
    ctx: CanvasRenderingContext2D,
    group: readonly Strand[],
    color: string,
    style: StrandStyle
  ) {
    ctx.globalAlpha = style.alpha;
    ctx.lineWidth = style.width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const strand of group) {
      // A collapsed segment means the strand just respawned elsewhere.
      if (strand.px === strand.x && strand.py === strand.y) continue;
      ctx.moveTo(strand.px, strand.py);
      ctx.lineTo(strand.x, strand.y);
    }
    ctx.stroke();
  }

  function onFrame({ ctx, palette, pointer }: AmbientFrame<Palette>) {
    ctx.globalAlpha = washed ? TRAIL_FADE_ALPHA : 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);
    washed = true;

    time += FIELD_TIME_STEP;
    for (const strand of strands) advance(strand, pointer);

    ctx.lineCap = "round";
    strokeGroup(ctx, silkStrands, palette.silk, palette.silkStyle);
    strokeGroup(ctx, goldStrands, palette.accent, palette.goldStyle);
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
    silk: computed.getPropertyValue("--rialto-text-primary").trim(),
    goldStyle: isDark ? GOLD_STYLE.dark : GOLD_STYLE.light,
    silkStyle: isDark ? SILK_STYLE.dark : SILK_STYLE.light,
  };
}
