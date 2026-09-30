/**
 * png.mjs — width × height of a PNG from its header, no image library
 * (docs/features/ui-quality-loop/architecture.md § Resolutions, Architect
 * re-entry 3: "A PNG-header check pins every reference and every calibration
 * `ours` at exactly 1280×720 px").
 *
 * A PNG is the 8-byte signature followed by chunks; the first chunk is always
 * IHDR, whose data opens with width and height as big-endian uint32s. Anything
 * else throws — the caller decides the exit code.
 */

import { readFileSync } from "node:fs";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** signature (8) + chunk length (4) + chunk type (4) + width (4) + height (4) */
const HEADER_BYTES = 24;

/** @param {Buffer} bytes @returns {{ width: number, height: number }} */
export function pngSize(bytes) {
  if (bytes.length < HEADER_BYTES || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("not a PNG (bad signature or truncated header)");
  }
  const type = bytes.toString("ascii", 12, 16);
  if (type !== "IHDR") throw new Error(`not a PNG: first chunk is ${type}, not IHDR`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** @param {string} path @returns {{ width: number, height: number }} */
export function pngSizeOfFile(path) {
  try {
    return pngSize(readFileSync(path));
  } catch (err) {
    throw new Error(`${path}: ${err.message}`, { cause: err });
  }
}
