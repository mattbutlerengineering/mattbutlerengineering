/**
 * Dominant-colour extraction by k-means, ported from eat-sheet's
 * `src/server/features/venues/color-extraction.ts` (vendored verbatim at
 * `docs/reference/eat-sheet/`). Every constant below is read from that file —
 * sampling stride, alpha threshold, the near-white and near-black cutoffs, the
 * iteration count and the dominance ordering — so a logo yields the palette
 * eat-sheet gave it.
 *
 * eat-sheet decoded PNG/JPEG itself because it ran in a Cloudflare Worker with
 * no image decoder. Here the pixels arrive from a `<canvas>`, so this module
 * takes an RGBA byte array and knows nothing about files, canvases or HTTP —
 * which is what makes it testable without a rasteriser.
 */

export interface RgbPixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface Centroid extends RgbPixel {
  readonly count: number;
}

/** A flat RGBA byte array — `Uint8Array`, or the `Uint8ClampedArray` of `ImageData`. */
export type RgbaBytes = Uint8Array | Uint8ClampedArray;

export const DEFAULT_MAX_COLORS = 5;
/** Sample every Nth pixel. */
export const PIXEL_STRIDE = 10;
const KMEANS_ITERATIONS = 10;
const ALPHA_THRESHOLD = 128;
const NEAR_WHITE_THRESHOLD = 240;
const NEAR_BLACK_THRESHOLD = 15;

/**
 * Longest edge the canvas adapter draws to before sampling. At 256 even a
 * 4000x3000 logo yields under 5,000 sampled pixels, so k-means cannot stall
 * the operator's browser.
 */
const MAX_SAMPLE_EDGE = 256;

/** The box an image is drawn into before sampling, preserving aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_SAMPLE_EDGE
): { readonly width: number; readonly height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/**
 * Sampled pixels, skipping the transparent, near-white and near-black ones.
 * Reads `rgba` without writing to it.
 */
export function samplePixels(rgba: RgbaBytes): readonly RgbPixel[] {
  const pixels: RgbPixel[] = [];
  const pixelCount = Math.floor(rgba.length / 4);

  for (let i = 0; i < pixelCount; i += PIXEL_STRIDE) {
    const offset = i * 4;
    const r = rgba[offset] ?? 0;
    const g = rgba[offset + 1] ?? 0;
    const b = rgba[offset + 2] ?? 0;
    const a = rgba[offset + 3] ?? 0;

    if (a < ALPHA_THRESHOLD) continue;
    if (r > NEAR_WHITE_THRESHOLD && g > NEAR_WHITE_THRESHOLD && b > NEAR_WHITE_THRESHOLD) continue;
    if (r < NEAR_BLACK_THRESHOLD && g < NEAR_BLACK_THRESHOLD && b < NEAR_BLACK_THRESHOLD) continue;

    pixels.push({ r, g, b });
  }

  return pixels;
}

function distance(a: RgbPixel, b: RgbPixel): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Spread initial centroids evenly through the pixel list, for determinism. */
function initCentroids(pixels: readonly RgbPixel[], k: number): readonly RgbPixel[] {
  const step = Math.max(1, Math.floor(pixels.length / k));
  return Array.from(
    { length: k },
    (_, i) => pixels[Math.min(i * step, pixels.length - 1)] as RgbPixel
  );
}

function nearestCentroid(pixel: RgbPixel, centroids: readonly RgbPixel[]): number {
  let minDist = Infinity;
  let nearest = 0;
  for (let ci = 0; ci < centroids.length; ci++) {
    const d = distance(pixel, centroids[ci] as RgbPixel);
    if (d < minDist) {
      minDist = d;
      nearest = ci;
    }
  }
  return nearest;
}

function meanOf(cluster: readonly RgbPixel[]): RgbPixel {
  const sum = cluster.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), {
    r: 0,
    g: 0,
    b: 0,
  });
  return {
    r: Math.round(sum.r / cluster.length),
    g: Math.round(sum.g / cluster.length),
    b: Math.round(sum.b / cluster.length),
  };
}

function runKMeans(pixels: readonly RgbPixel[], k: number): readonly Centroid[] {
  if (pixels.length === 0) return [];

  const clampedK = Math.min(k, pixels.length);
  let centroids = initCentroids(pixels, clampedK);

  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    const clusters: RgbPixel[][] = Array.from({ length: clampedK }, () => []);
    for (const pixel of pixels) {
      (clusters[nearestCentroid(pixel, centroids)] as RgbPixel[]).push(pixel);
    }
    // An empty cluster keeps its previous centroid rather than drifting.
    centroids = clusters.map((cluster, ci) =>
      cluster.length === 0 ? (centroids[ci] as RgbPixel) : meanOf(cluster)
    );
  }

  const clusterSizes: number[] = Array<number>(clampedK).fill(0);
  for (const pixel of pixels) {
    const nearest = nearestCentroid(pixel, centroids);
    clusterSizes[nearest] = (clusterSizes[nearest] ?? 0) + 1;
  }

  return centroids.map((c, i) => ({ ...c, count: clusterSizes[i] ?? 0 }));
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function centroidToHex(c: RgbPixel): string {
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

/**
 * Dominant colours of an RGBA image, as `#rrggbb` ranked by dominance.
 * An image whose every pixel is transparent, near-white or near-black yields
 * an empty palette — there is no brand colour to be had from it.
 */
export function extractDominantColors(
  rgba: RgbaBytes,
  maxColors = DEFAULT_MAX_COLORS
): readonly string[] {
  const pixels = samplePixels(rgba);
  if (pixels.length === 0) return [];

  const ranked = runKMeans(pixels, maxColors).filter((c) => c.count > 0);
  return [...ranked].sort((a, b) => b.count - a.count).map(centroidToHex);
}
