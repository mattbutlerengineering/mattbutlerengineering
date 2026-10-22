// @ts-ignore — upng-js ships no bundled .d.ts; declaration in src/types/upng-js.d.ts
import UPNG from "upng-js";
// @ts-ignore — jpeg-js ships no bundled .d.ts; declaration in src/types/jpeg-js.d.ts
import jpeg from "jpeg-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RgbPixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface Centroid extends RgbPixel {
  readonly count: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_COLORS = 5;
const PIXEL_STRIDE = 10; // sample every Nth pixel
const KMEANS_ITERATIONS = 10;
const ALPHA_THRESHOLD = 128;
const NEAR_WHITE_THRESHOLD = 240;
const NEAR_BLACK_THRESHOLD = 15;

// ---------------------------------------------------------------------------
// Pixel decoding
// ---------------------------------------------------------------------------

function decodePng(bytes: Uint8Array): readonly RgbPixel[] {
  const img = UPNG.decode(bytes.buffer as ArrayBuffer);
  const frames = UPNG.toRGBA8(img) as ArrayBuffer[];
  if (frames.length === 0) return [];

  const rgba = new Uint8Array(frames[0] as ArrayBuffer);
  return extractPixels(rgba);
}

function decodeJpeg(bytes: Uint8Array): readonly RgbPixel[] {
  const result = jpeg.decode(bytes, { useTArray: true }) as {
    data: Uint8Array;
    width: number;
    height: number;
  };
  return extractPixels(result.data);
}

/**
 * Extract sampled pixels from a flat RGBA byte array.
 * Skips transparent, near-white, and near-black pixels.
 */
function extractPixels(rgba: Uint8Array): readonly RgbPixel[] {
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

// ---------------------------------------------------------------------------
// K-means clustering
// ---------------------------------------------------------------------------

function distance(a: RgbPixel, b: RgbPixel): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function initCentroids(pixels: readonly RgbPixel[], k: number): readonly RgbPixel[] {
  // Spread initial centroids evenly through the pixel list for determinism
  const step = Math.max(1, Math.floor(pixels.length / k));
  return Array.from({ length: k }, (_, i) => pixels[Math.min(i * step, pixels.length - 1)] as RgbPixel);
}

function runKMeans(pixels: readonly RgbPixel[], k: number): readonly Centroid[] {
  if (pixels.length === 0) return [];

  const clampedK = Math.min(k, pixels.length);
  let centroids = initCentroids(pixels, clampedK);

  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    // Assign each pixel to nearest centroid
    const clusters: RgbPixel[][] = Array.from({ length: clampedK }, () => []);

    for (const pixel of pixels) {
      let minDist = Infinity;
      let nearest = 0;
      for (let ci = 0; ci < centroids.length; ci++) {
        const d = distance(pixel, centroids[ci] as RgbPixel);
        if (d < minDist) {
          minDist = d;
          nearest = ci;
        }
      }
      (clusters[nearest] as RgbPixel[]).push(pixel);
    }

    // Recompute centroids as mean of cluster members
    centroids = clusters.map((cluster, ci) => {
      if (cluster.length === 0) return centroids[ci] as RgbPixel;
      const sum = cluster.reduce(
        (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
        { r: 0, g: 0, b: 0 },
      );
      return {
        r: Math.round(sum.r / cluster.length),
        g: Math.round(sum.g / cluster.length),
        b: Math.round(sum.b / cluster.length),
      };
    });
  }

  // Final assignment to get cluster sizes
  const clusterSizes: number[] = Array(clampedK).fill(0) as number[];
  for (const pixel of pixels) {
    let minDist = Infinity;
    let nearest = 0;
    for (let ci = 0; ci < centroids.length; ci++) {
      const d = distance(pixel, centroids[ci] as RgbPixel);
      if (d < minDist) {
        minDist = d;
        nearest = ci;
      }
    }
    clusterSizes[nearest] = (clusterSizes[nearest] ?? 0) + 1;
  }

  return centroids.map((c, i) => ({ ...c, count: clusterSizes[i] ?? 0 }));
}

// ---------------------------------------------------------------------------
// Hex conversion
// ---------------------------------------------------------------------------

function toHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function centroidToHex(c: RgbPixel): string {
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract dominant colors from image bytes using k-means clustering.
 * Works in Cloudflare Workers (no Canvas API, no Node native modules).
 *
 * @param bytes    Raw image bytes
 * @param mimeType MIME type of the image (e.g. "image/png", "image/jpeg")
 * @param maxColors Number of dominant colors to extract (default 5)
 * @returns Hex color strings sorted by dominance, e.g. ["#c49a2a", "#1a3a1a"]
 */
export async function extractDominantColors(
  bytes: Uint8Array,
  mimeType: string,
  maxColors = DEFAULT_MAX_COLORS,
): Promise<readonly string[]> {
  // Guard: empty input
  if (bytes.length === 0) return [];

  // Guard: SVGs have no pixel data
  if (mimeType === "image/svg+xml") return [];

  let pixels: readonly RgbPixel[];

  try {
    if (mimeType === "image/png") {
      pixels = decodePng(bytes);
    } else if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      pixels = decodeJpeg(bytes);
    } else {
      // Unsupported format
      return [];
    }
  } catch {
    // Decode failures return empty rather than throwing
    return [];
  }

  if (pixels.length === 0) return [];

  const clusters = runKMeans(pixels, maxColors);

  return clusters
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(centroidToHex);
}
