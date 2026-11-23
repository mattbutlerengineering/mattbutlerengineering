import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import {
  createPoints,
  createRandom,
  isGoldPoint,
  LINK_DISTANCE,
  LINK_TIER_COUNT,
  linkTier,
  nearestToPointer,
  pointCount,
  POINT_RADIUS,
  POINTER_LINKS_MAX,
  spawnPoint,
  WRAP_MARGIN,
  wrap,
  type Points,
} from "./constellation-field";

const SEED = 20261122;
const FULL_CIRCLE = Math.PI * 2;
const LINE_WIDTH = 1;

/** Line alpha per band (faint to strong), the pointer's links, and the dots. */
const ALPHA = {
  dark: { links: [0.08, 0.16, 0.28], pointer: 0.5, ink: 0.6, gold: 0.9 },
  light: { links: [0.06, 0.12, 0.22], pointer: 0.4, ink: 0.5, gold: 0.85 },
} as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly ink: string;
  readonly alpha: (typeof ALPHA)[keyof typeof ALPHA];
}

/**
 * Starts the constellation animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the points and
 * their links. Work per frame is bounded by the point cap: one pair scan per
 * line band, batched into one stroke each, plus two dot fills.
 */
export function startConstellation(canvas: HTMLCanvasElement): () => void {
  const random = createRandom(SEED);
  let width = 0;
  let height = 0;
  let points: Points = createPoints(0);
  const nearest = new Int16Array(POINTER_LINKS_MAX);
  const linkSq = LINK_DISTANCE * LINK_DISTANCE;

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
    points = createPoints(pointCount(width, height));
    for (let i = 0; i < points.count; i++) spawnPoint(points, i, width, height, random);
  }

  function advance() {
    for (let i = 0; i < points.count; i++) {
      points.x[i] = wrap((points.x[i] ?? 0) + (points.vx[i] ?? 0), width, WRAP_MARGIN);
      points.y[i] = wrap((points.y[i] ?? 0) + (points.vy[i] ?? 0), height, WRAP_MARGIN);
    }
  }

  function strokeBand(ctx: CanvasRenderingContext2D, band: number, palette: Palette) {
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < points.count; i++) {
      const xi = points.x[i] ?? 0;
      const yi = points.y[i] ?? 0;
      for (let j = i + 1; j < points.count; j++) {
        const dx = (points.x[j] ?? 0) - xi;
        const dy = (points.y[j] ?? 0) - yi;
        const d2 = dx * dx + dy * dy;
        if (d2 >= linkSq || linkTier(Math.sqrt(d2)) !== band) continue;
        any = true;
        ctx.moveTo(xi, yi);
        ctx.lineTo(points.x[j] ?? 0, points.y[j] ?? 0);
      }
    }
    if (!any) return;
    ctx.globalAlpha = palette.alpha.links[band] ?? 0;
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
  }

  function strokePointerLinks(
    ctx: CanvasRenderingContext2D,
    pointer: Readonly<{ x: number; y: number }>,
    palette: Palette
  ) {
    const found = nearestToPointer(points.x, points.y, points.count, pointer.x, pointer.y, nearest);
    if (found === 0) return;
    ctx.beginPath();
    for (let k = 0; k < found; k++) {
      const index = nearest[k] ?? 0;
      ctx.moveTo(pointer.x, pointer.y);
      ctx.lineTo(points.x[index] ?? 0, points.y[index] ?? 0);
    }
    ctx.globalAlpha = palette.alpha.pointer;
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
  }

  function fillDots(ctx: CanvasRenderingContext2D, gold: boolean, palette: Palette) {
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < points.count; i++) {
      if (isGoldPoint(i) !== gold) continue;
      any = true;
      const x = points.x[i] ?? 0;
      const y = points.y[i] ?? 0;
      ctx.moveTo(x + POINT_RADIUS, y);
      ctx.arc(x, y, POINT_RADIUS, 0, FULL_CIRCLE);
    }
    if (!any) return;
    ctx.globalAlpha = gold ? palette.alpha.gold : palette.alpha.ink;
    ctx.fillStyle = gold ? palette.accent : palette.ink;
    ctx.fill();
  }

  function onFrame({ ctx, palette, pointer }: AmbientFrame<Palette>) {
    // Opaque every frame: crisp points and lines, no trails.
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    advance();
    ctx.lineWidth = LINE_WIDTH;
    for (let band = 0; band < LINK_TIER_COUNT; band++) strokeBand(ctx, band, palette);
    strokePointerLinks(ctx, pointer, palette);
    fillDots(ctx, false, palette);
    fillDots(ctx, true, palette);
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
    alpha: ALPHA[isDark ? "dark" : "light"],
  };
}
