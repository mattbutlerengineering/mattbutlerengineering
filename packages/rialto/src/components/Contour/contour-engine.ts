import {
  startAmbientCanvas,
  type AmbientFrame,
  type AmbientSize,
} from "../_ambient/ambient-canvas";
import { createValueNoise } from "../SilkFlow/silk-flow-field";
import {
  CONTOUR_LEVELS,
  FIELD_TIME_STEP,
  fieldHeight,
  GOLD_LEVEL_INDEX,
  gridDimensions,
  marchCell,
  pointerLift,
  type GridDimensions,
} from "./contour-field";

/** Fraction of the remaining pointer strength closed each frame. */
const POINTER_EASE = 0.08;

interface LineStyle {
  readonly alpha: number;
  readonly width: number;
}

const GOLD_STYLE = {
  dark: { alpha: 0.65, width: 1.3 },
  light: { alpha: 0.55, width: 1.3 },
} as const;

const INK_STYLE = {
  dark: { alpha: 0.26, width: 0.8 },
  light: { alpha: 0.2, width: 0.8 },
} as const;

interface Palette {
  readonly surface: string;
  readonly accent: string;
  readonly ink: string;
  readonly goldStyle: LineStyle;
  readonly inkStyle: LineStyle;
}

/**
 * Starts the contour animation on `canvas` and returns its teardown.
 *
 * The generic loop plumbing (resize, playback, theme, pointer, teardown) lives
 * in the shared ambient-canvas runtime; this file owns only the isoline drawing.
 */
export function startContour(canvas: HTMLCanvasElement): () => void {
  const noise = createValueNoise();
  let width = 0;
  let height = 0;
  let grid: GridDimensions = gridDimensions(0, 0);
  let heights = new Float32Array(0);
  let time = 0;
  /** Eased 0..1 strength of the pointer hill; private to this render closure. */
  let hillStrength = 0;

  function onResize(size: AmbientSize) {
    width = size.width;
    height = size.height;
    grid = gridDimensions(width, height);
    heights = new Float32Array((grid.cols + 1) * (grid.rows + 1));
  }

  function sampleField(pointer: Readonly<{ x: number; y: number }>) {
    const stride = grid.cols + 1;
    for (let row = 0; row <= grid.rows; row++) {
      const y = row * grid.cell;
      for (let col = 0; col <= grid.cols; col++) {
        const x = col * grid.cell;
        const lift = hillStrength * pointerLift(x - pointer.x, y - pointer.y);
        heights[row * stride + col] = fieldHeight(noise, x, y, time) + lift;
      }
    }
  }

  function strokeLevel(
    ctx: CanvasRenderingContext2D,
    level: number,
    color: string,
    style: LineStyle
  ) {
    const stride = grid.cols + 1;
    ctx.globalAlpha = style.alpha;
    ctx.lineWidth = style.width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const i = row * stride + col;
        const segments = marchCell(
          heights[i] ?? 0,
          heights[i + 1] ?? 0,
          heights[i + stride + 1] ?? 0,
          heights[i + stride] ?? 0,
          level
        );
        const ox = col * grid.cell;
        const oy = row * grid.cell;
        for (const s of segments) {
          ctx.moveTo(ox + s.x1 * grid.cell, oy + s.y1 * grid.cell);
          ctx.lineTo(ox + s.x2 * grid.cell, oy + s.y2 * grid.cell);
        }
      }
    }
    ctx.stroke();
  }

  function onFrame({ ctx, palette, pointer }: AmbientFrame<Palette>) {
    // Opaque every frame: crisp isolines, no trails.
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, 0, width, height);

    time += FIELD_TIME_STEP;
    const inside = Number.isFinite(pointer.x) && Number.isFinite(pointer.y);
    hillStrength += ((inside ? 1 : 0) - hillStrength) * POINTER_EASE;
    sampleField(pointer);

    CONTOUR_LEVELS.forEach((level, index) => {
      const isGold = index === GOLD_LEVEL_INDEX;
      strokeLevel(
        ctx,
        level,
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
