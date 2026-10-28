/// <reference types="node" />
// @vitest-environment node
/**
 * /favicon.ico pin test (#7570).
 *
 * Browsers request /favicon.ico regardless of <link rel="icon">. The Worker
 * uses single-page-application not-found handling, so a missing file serves
 * the custom 404 page. A real ICO must ship in public/ and index.html must
 * link it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICO_PATH = resolve(__dirname, "../public/favicon.ico");
const INDEX_HTML_PATH = resolve(__dirname, "../index.html");

describe("favicon.ico", () => {
  it("is a valid ICO with 16, 32 and 48 px images", () => {
    const ico = readFileSync(ICO_PATH);
    expect([...ico.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16]);
    expect(sizes).toEqual([16, 32, 48]);
    for (let i = 0; i < count; i++) {
      const size = ico.readUInt32LE(6 + i * 16 + 8);
      const offset = ico.readUInt32LE(6 + i * 16 + 12);
      expect(offset + size).toBeLessThanOrEqual(ico.length);
      // PNG signature
      expect([...ico.subarray(offset, offset + 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });

  it("is linked from index.html", () => {
    const html = readFileSync(INDEX_HTML_PATH, "utf8");
    expect(html).toMatch(/<link rel="icon" href="\/favicon\.ico" sizes="any"\s*\/?>/);
  });
});
