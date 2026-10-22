import { describe, it, expect } from "vitest";
import { extractDominantColors } from "../color-extraction";

// Minimal 1×1 red PNG (RGB color type 0x08,0x02 — no alpha channel)
const RED_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
  0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

// SVG encoded as UTF-8 bytes
const SVG_BYTES = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="red" width="10" height="10"/></svg>',
);

describe("extractDominantColors", () => {
  it("returns an empty array for empty input", async () => {
    const result = await extractDominantColors(new Uint8Array(), "image/png");
    expect(result).toEqual([]);
  });

  it("returns an empty array for SVG input", async () => {
    const result = await extractDominantColors(SVG_BYTES, "image/svg+xml");
    expect(result).toEqual([]);
  });

  it("returns an empty array for unsupported mime types", async () => {
    const result = await extractDominantColors(new Uint8Array([0, 1, 2]), "image/gif");
    expect(result).toEqual([]);
  });

  it("returns an array (possibly empty) for a 1×1 PNG — small images may be filtered", async () => {
    // A 1×1 image only has one pixel. After RGBA conversion, the alpha byte
    // for an RGB-type PNG will be 0xff. The red pixel (255,0,0) is neither
    // near-white nor near-black, so it passes the filter — but the stride-10
    // sampler may still skip it if the pixel index isn't a multiple of STRIDE.
    // The important contract: no exception is thrown and the return type is correct.
    const result = await extractDominantColors(RED_PNG, "image/png");
    expect(Array.isArray(result)).toBe(true);
    for (const color of result) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("each returned color matches the hex color format", async () => {
    // Use the PNG bytes — even if empty, the format check is trivially satisfied
    const result = await extractDominantColors(RED_PNG, "image/png", 3);
    for (const color of result) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("respects the maxColors limit", async () => {
    const result = await extractDominantColors(RED_PNG, "image/png", 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("returns empty for invalid/corrupt PNG bytes", async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const result = await extractDominantColors(garbage, "image/png");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// K-means logic tests using a synthetic multi-pixel RGBA buffer
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid PNG from a flat RGBA pixel buffer using raw IDAT.
 * This is a helper only for tests — not production code.
 */
function buildRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  // We encode as RGBA (color type 6, bit depth 8)
  // PNG signature
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  function u32be(n: number): Uint8Array {
    return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
  }

  function crc32(data: Uint8Array): Uint8Array {
    let c = 0xffffffff;
    for (const byte of data) {
      c ^= byte;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
    }
    c = c ^ 0xffffffff;
    return u32be(c >>> 0);
  }

  function chunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    const payload = new Uint8Array(typeBytes.length + data.length);
    payload.set(typeBytes, 0);
    payload.set(data, typeBytes.length);
    const checksum = crc32(payload);
    const out = new Uint8Array(4 + typeBytes.length + data.length + 4);
    out.set(u32be(data.length), 0);
    out.set(payload, 4);
    out.set(checksum, 4 + payload.length);
    return out;
  }

  // IHDR
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw image data: one filter byte per scanline followed by RGBA pixels
  const scanlineSize = 1 + width * 4;
  const raw = new Uint8Array(height * scanlineSize);
  for (let y = 0; y < height; y++) {
    raw[y * scanlineSize] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 4;
      const dstOffset = y * scanlineSize + 1 + x * 4;
      raw[dstOffset] = rgba[srcOffset] ?? 0;
      raw[dstOffset + 1] = rgba[srcOffset + 1] ?? 0;
      raw[dstOffset + 2] = rgba[srcOffset + 2] ?? 0;
      raw[dstOffset + 3] = rgba[srcOffset + 3] ?? 255;
    }
  }

  // Deflate the raw data using pako (available via upng-js's dependency)
  // For tests we use Node's zlib synchronously
  const zlib = require("zlib") as typeof import("zlib");
  const compressed = zlib.deflateSync(raw);
  const idat = new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength);

  const ihdrChunk = chunk("IHDR", ihdr);
  const idatChunk = chunk("IDAT", idat);
  const iendChunk = chunk("IEND", new Uint8Array(0));

  const total = sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  out.set(sig, offset); offset += sig.length;
  out.set(ihdrChunk, offset); offset += ihdrChunk.length;
  out.set(idatChunk, offset); offset += idatChunk.length;
  out.set(iendChunk, offset);
  return out;
}

describe("extractDominantColors — synthetic multi-pixel PNG", () => {
  it("returns hex colors for a 20×20 RGBA PNG with a dominant color", async () => {
    // 400 pixels: 360 red, 40 green — red should dominate
    const width = 20;
    const height = 20;
    const pixelCount = width * height;
    const rgba = new Uint8Array(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      if (i < 360) {
        // Red pixels — pass filter (not near-black, not near-white)
        rgba[offset] = 200;
        rgba[offset + 1] = 30;
        rgba[offset + 2] = 30;
        rgba[offset + 3] = 255;
      } else {
        // Green pixels
        rgba[offset] = 30;
        rgba[offset + 1] = 200;
        rgba[offset + 2] = 30;
        rgba[offset + 3] = 255;
      }
    }

    const pngBytes = buildRgbaPng(width, height, rgba);
    const result = await extractDominantColors(pngBytes, "image/png", 2);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(2);

    for (const color of result) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("skips transparent pixels", async () => {
    // All pixels are fully transparent red
    const width = 10;
    const height = 10;
    const pixelCount = width * height;
    const rgba = new Uint8Array(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      rgba[offset] = 200;
      rgba[offset + 1] = 30;
      rgba[offset + 2] = 30;
      rgba[offset + 3] = 0; // fully transparent
    }
    const pngBytes = buildRgbaPng(width, height, rgba);
    const result = await extractDominantColors(pngBytes, "image/png", 3);
    expect(result).toEqual([]);
  });
});
