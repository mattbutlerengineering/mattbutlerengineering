/**
 * The thin browser seam between a logo the operator picked and the pure
 * k-means core in `logo-palette.ts`: decode, draw into a bounded canvas, read
 * the pixels back, hand them over. Deliberately thin — jsdom has no
 * rasteriser, so anything that cannot be tested belongs on this side of the
 * line and nowhere else.
 *
 * The file never leaves the browser. Nothing here uploads, stores or encodes
 * it; only the returned palette is ever persisted.
 */

import { DEFAULT_MAX_COLORS, extractDominantColors, fitWithin } from "./logo-palette.js";

/** Raster formats `createImageBitmap` can decode in every browser we target. */
export const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Byte cap applied before decoding — an operator-chosen file is untrusted input. */
export const MAX_LOGO_BYTES = 8 * 1024 * 1024;

export type LogoPaletteFailure = "unsupported-type" | "too-large" | "decode-failed";

export type LogoPaletteResult =
  | { readonly ok: true; readonly palette: readonly string[] }
  | { readonly ok: false; readonly reason: LogoPaletteFailure };

/** Why this file cannot be sampled, or null when it can. */
export function classifyLogoFile(file: Pick<File, "type" | "size">): LogoPaletteFailure | null {
  if (!ACCEPTED_LOGO_TYPES.some((type) => type === file.type)) return "unsupported-type";
  if (file.size > MAX_LOGO_BYTES) return "too-large";
  return null;
}

/**
 * The logo's ranked palette. An empty `palette` on a successful read is a real
 * answer, not an error: an all-white, all-black or fully transparent logo has
 * no brand colour in it.
 */
export async function readLogoPalette(
  file: File,
  maxColors = DEFAULT_MAX_COLORS
): Promise<LogoPaletteResult> {
  const invalid = classifyLogoFile(file);
  if (invalid !== null) return { ok: false, reason: invalid };

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const { width, height } = fitWithin(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) return { ok: false, reason: "decode-failed" };
      context.drawImage(bitmap, 0, 0, width, height);
      const { data } = context.getImageData(0, 0, width, height);
      return { ok: true, palette: extractDominantColors(data, maxColors) };
    } finally {
      bitmap.close();
    }
  } catch {
    return { ok: false, reason: "decode-failed" };
  }
}
