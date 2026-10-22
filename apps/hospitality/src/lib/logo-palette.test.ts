import { describe, expect, it } from "vitest";
import { PIXEL_STRIDE, extractDominantColors, fitWithin, samplePixels } from "./logo-palette.js";

type Rgba = readonly [number, number, number, number];

const RED: Rgba = [200, 30, 30, 255];
const GREEN: Rgba = [30, 200, 30, 255];
const WINE: Rgba = [122, 31, 61, 255];

/** Flatten a pixel list into the RGBA byte array a canvas would hand over. */
function rgbaOf(pixels: readonly Rgba[]): Uint8Array {
  return new Uint8Array(pixels.flat());
}

function fill(pixel: Rgba, count: number): readonly Rgba[] {
  return Array.from({ length: count }, () => pixel);
}

describe("samplePixels", () => {
  it("takes every tenth pixel and no other", () => {
    // Only indices 0 and 10 are red; a stride of 9 or 11 would catch a green.
    const pixels = [...fill(GREEN, 20)];
    const withRed = pixels.map((p, i) => (i === 0 || i === 10 ? RED : p));
    expect(samplePixels(rgbaOf(withRed))).toEqual([
      { r: 200, g: 30, b: 30 },
      { r: 200, g: 30, b: 30 },
    ]);
    expect(PIXEL_STRIDE).toBe(10);
  });

  it("keeps a pixel at the alpha threshold and drops the one below it", () => {
    expect(samplePixels(rgbaOf(fill([122, 31, 61, 128], 10)))).toHaveLength(1);
    expect(samplePixels(rgbaOf(fill([122, 31, 61, 127], 10)))).toEqual([]);
  });

  it("keeps a pixel at the near-white cutoff and drops the one above it", () => {
    expect(samplePixels(rgbaOf(fill([240, 240, 240, 255], 10)))).toHaveLength(1);
    expect(samplePixels(rgbaOf(fill([241, 241, 241, 255], 10)))).toEqual([]);
  });

  it("keeps a pixel at the near-black cutoff and drops the one below it", () => {
    expect(samplePixels(rgbaOf(fill([15, 15, 15, 255], 10)))).toHaveLength(1);
    expect(samplePixels(rgbaOf(fill([14, 14, 14, 255], 10)))).toEqual([]);
  });

  it("never mutates the array it was handed", () => {
    const rgba = rgbaOf(fill(WINE, 10));
    const before = Uint8Array.from(rgba);
    samplePixels(rgba);
    expect(rgba).toEqual(before);
  });

  it("bounds the sampled count for an image the adapter has downscaled", () => {
    const { width, height } = fitWithin(4000, 3000);
    const sampled = samplePixels(rgbaOf(fill(WINE, width * height)));
    expect(sampled).toHaveLength(Math.ceil((width * height) / PIXEL_STRIDE));
    expect(sampled.length).toBeLessThanOrEqual(5000);
  });
});

describe("fitWithin", () => {
  it("leaves an image already inside the budget alone", () => {
    expect(fitWithin(100, 80)).toEqual({ width: 100, height: 80 });
  });

  it("scales a huge image down by its longest edge", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 256, height: 192 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 192, height: 256 });
  });

  it("never collapses an extreme aspect ratio to zero", () => {
    expect(fitWithin(10000, 1)).toEqual({ width: 256, height: 1 });
  });
});

describe("extractDominantColors", () => {
  it("returns the one colour of a flat single-colour image", () => {
    expect(extractDominantColors(rgbaOf(fill(WINE, 100)))).toEqual(["#7a1f3d"]);
  });

  it("returns nothing for a fully transparent image", () => {
    expect(extractDominantColors(rgbaOf(fill([200, 30, 30, 0], 100)))).toEqual([]);
  });

  it("rejects an all-white image down to nothing", () => {
    expect(extractDominantColors(rgbaOf(fill([255, 255, 255, 255], 100)))).toEqual([]);
  });

  it("rejects an all-black image down to nothing", () => {
    expect(extractDominantColors(rgbaOf(fill([0, 0, 0, 255], 100)))).toEqual([]);
  });

  it("fits both centroids of a two-tone image and ranks them by dominance", () => {
    const pixels = [...fill(RED, 150), ...fill(GREEN, 50)];
    expect(extractDominantColors(rgbaOf(pixels), 2)).toEqual(["#c81e1e", "#1ec81e"]);
  });

  it("caps the palette at maxColors", () => {
    const pixels = [...fill(RED, 10), ...fill(GREEN, 10), ...fill(WINE, 10)];
    expect(extractDominantColors(rgbaOf(pixels), 2)).toHaveLength(2);
    expect(extractDominantColors(rgbaOf(pixels))).toHaveLength(3);
  });

  it("returns nothing for an empty array", () => {
    expect(extractDominantColors(new Uint8Array())).toEqual([]);
  });

  it("accepts the Uint8ClampedArray a canvas hands over", () => {
    const clamped = Uint8ClampedArray.from(rgbaOf(fill(WINE, 100)));
    expect(extractDominantColors(clamped)).toEqual(["#7a1f3d"]);
  });
});
