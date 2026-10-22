/**
 * A minimal PNG reader and the WCAG contrast maths, used by the floor-texture
 * guards to measure the committed texture bytes rather than assume anything
 * about them.
 *
 * It handles exactly the shape every floor texture is in — 8-bit RGBA,
 * non-interlaced — and throws on anything else, so an asset swapped for a
 * different encoding fails loudly instead of being measured wrongly. `zlib` is
 * built into Node, so this needs no image dependency (the migration forbids
 * adding one).
 */

import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RGBA_CHANNELS = 4;
const EIGHT_BIT = 8;
const COLOR_TYPE_RGBA = 6;

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA bytes, `width * height * 4` long. */
  readonly data: Uint8Array;
}

/** Reverses one scanline's PNG filter in place, given the already-decoded row above. */
function unfilterRow(
  filterType: number,
  row: Uint8Array,
  previous: Uint8Array,
  out: Uint8Array
): void {
  for (let i = 0; i < row.length; i++) {
    const left = i >= RGBA_CHANNELS ? out[i - RGBA_CHANNELS]! : 0;
    const up = previous[i]!;
    const upLeft = i >= RGBA_CHANNELS ? previous[i - RGBA_CHANNELS]! : 0;
    let value: number;
    switch (filterType) {
      case 0:
        value = row[i]!;
        break;
      case 1:
        value = row[i]! + left;
        break;
      case 2:
        value = row[i]! + up;
        break;
      case 3:
        value = row[i]! + ((left + up) >> 1);
        break;
      case 4: {
        const predictor = left + up - upLeft;
        const dLeft = Math.abs(predictor - left);
        const dUp = Math.abs(predictor - up);
        const dUpLeft = Math.abs(predictor - upLeft);
        const paeth = dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
        value = row[i]! + paeth;
        break;
      }
      default:
        throw new Error(`Unsupported PNG filter type ${filterType}`);
    }
    out[i] = value & 0xff;
  }
}

/** Decodes an 8-bit, non-interlaced RGBA PNG. Throws on any other encoding. */
export function decodePng(bytes: Buffer): DecodedPng {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Not a PNG");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const interlace = bytes[28];
  if (bitDepth !== EIGHT_BIT || colorType !== COLOR_TYPE_RGBA || interlace !== 0) {
    throw new Error(
      `Unsupported PNG: bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`
    );
  }

  const idat: Buffer[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * RGBA_CHANNELS;
  const data = new Uint8Array(height * stride);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const out = new Uint8Array(stride);
    unfilterRow(raw[start]!, raw.subarray(start + 1, start + 1 + stride), previous, out);
    data.set(out, y * stride);
    previous = out;
  }
  return { width, height, data };
}

/** WCAG 2.x relative luminance of an 8-bit sRGB colour, in 0..1. */
export function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two relative luminances (1..21). */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
