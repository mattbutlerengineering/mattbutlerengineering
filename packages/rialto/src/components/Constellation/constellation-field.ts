/**
 * Pure maths behind the Constellation backdrop — no DOM, no canvas.
 *
 * A fixed pool of points lives in typed arrays, so the frame loop never
 * allocates per point: it only rewrites numbers in place.
 */

/** Cap on points so a huge canvas stays cheap: pair checks stay bounded. */
export const POINT_COUNT_MAX = 60;

/** One point per this many square CSS pixels, until the cap. */
const AREA_PER_POINT = 9000;

/** Every Nth point is gold: 5% of a full pool at most. */
export const GOLD_EVERY = 20;

/** Smallest and largest point radius in CSS pixels. */
const RADIUS = 1.6;

/** Drift speed in CSS pixels per frame: a slow float. */
const SPEED_MIN = 0.08;
const SPEED_RANGE = 0.17;

/** Points leave and re-enter past the edge by this many pixels. */
export const WRAP_MARGIN = 12;

/** Two points closer than this are joined by a line. */
export const LINK_DISTANCE = 140;

/** Line strength bands: 0 is the faintest (far), the last is the strongest (near). */
export const LINK_TIER_COUNT = 3;

/** The pointer links up to this many of the nearest points, within this reach. */
export const POINTER_LINKS_MAX = 3;
export const POINTER_REACH = 220;

export const POINT_RADIUS = RADIUS;

/** Point pool, one slot per point. Mutated in place by the engine's closure only. */
export interface Points {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
}

/** Small seeded generator (mulberry32) so a spawn never touches `Math.random`. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points for a canvas of the given CSS size, capped. */
export function pointCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  return Math.min(POINT_COUNT_MAX, Math.round((width * height) / AREA_PER_POINT));
}

export function isGoldPoint(index: number): boolean {
  return index % GOLD_EVERY === 0;
}

/**
 * Line strength band for two points `distance` apart, or -1 when they are too
 * far apart to be joined. Nearer pairs get a higher band.
 */
export function linkTier(distance: number): number {
  if (!(distance < LINK_DISTANCE)) return -1;
  const closeness = 1 - distance / LINK_DISTANCE;
  return Math.min(LINK_TIER_COUNT - 1, Math.floor(closeness * LINK_TIER_COUNT));
}

/**
 * Writes the indices of the points nearest the pointer into `out` (nearest
 * first, at most `out.length`, only within `POINTER_REACH`) and returns how many.
 * Zero while the pointer has never entered the canvas (infinite coordinates).
 */
export function nearestToPointer(
  xs: Float32Array,
  ys: Float32Array,
  count: number,
  pointerX: number,
  pointerY: number,
  out: Int16Array
): number {
  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return 0;
  const reachSq = POINTER_REACH * POINTER_REACH;
  const slots = Math.min(out.length, POINTER_LINKS_MAX);
  let found = 0;
  // Insertion into a tiny sorted prefix: O(count * slots), no allocation.
  const best = nearestScratch;
  for (let i = 0; i < count; i++) {
    const dx = (xs[i] ?? 0) - pointerX;
    const dy = (ys[i] ?? 0) - pointerY;
    const d2 = dx * dx + dy * dy;
    if (d2 > reachSq) continue;
    let at = found < slots ? found : slots;
    if (found === slots && d2 >= (best[slots - 1] ?? Infinity)) continue;
    while (at > 0 && d2 < (best[at - 1] ?? Infinity)) {
      if (at < slots) {
        best[at] = best[at - 1] ?? 0;
        out[at] = out[at - 1] ?? 0;
      }
      at--;
    }
    best[at] = d2;
    out[at] = i;
    if (found < slots) found++;
  }
  return found;
}

const nearestScratch = new Float32Array(POINTER_LINKS_MAX);

/** Wraps `value` across a `size` canvas, re-entering from the far edge. */
export function wrap(value: number, size: number, margin: number): number {
  if (value < -margin) return size + margin;
  if (value > size + margin) return -margin;
  return value;
}

/** Allocates the pool once; slots are filled by `spawnPoint`. */
export function createPoints(count: number): Points {
  return {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    vx: new Float32Array(count),
    vy: new Float32Array(count),
  };
}

/** Fills slot `i`: anywhere on the canvas, drifting in its own direction. */
export function spawnPoint(
  points: Points,
  i: number,
  width: number,
  height: number,
  random: () => number
): void {
  const speed = SPEED_MIN + SPEED_RANGE * random();
  const heading = random() * Math.PI * 2;
  points.x[i] = random() * width;
  points.y[i] = random() * height;
  points.vx[i] = Math.cos(heading) * speed;
  points.vy[i] = Math.sin(heading) * speed;
}
