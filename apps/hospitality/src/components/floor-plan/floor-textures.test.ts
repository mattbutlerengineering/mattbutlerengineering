import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FLOOR_MATERIALS, type FloorMaterial } from "@mbe/types";
import {
  FLOOR_TEXTURE_DIR,
  TEXTURE_SOURCE_PX,
  TEXTURE_TILE_PX,
  floorTextureUrl,
} from "./floor-textures.js";
import { decodePng, relativeLuminance, contrastRatio } from "../../test/png-luminance.js";

/* Vitest runs from apps/hospitality (see TableShape.test.tsx's note on why
 * `process.cwd()` is used rather than `import.meta.url`). */
const PUBLIC_DIR = resolve(process.cwd(), "public");
const SRC_DIR = resolve(process.cwd(), "src");

function texturePath(material: FloorMaterial): string {
  return resolve(PUBLIC_DIR, FLOOR_TEXTURE_DIR, `${material}.png`);
}

describe("floorTextureUrl", () => {
  it("resolves each material against the app's base URL", () => {
    expect(floorTextureUrl("hardwood", "/hospitality/")).toBe(
      "/hospitality/floor-plan/textures/hardwood.png"
    );
  });

  it("tolerates a base URL with no trailing slash", () => {
    expect(floorTextureUrl("marble", "/hospitality")).toBe(
      "/hospitality/floor-plan/textures/marble.png"
    );
  });

  it("covers all five materials with distinct URLs", () => {
    const urls = FLOOR_MATERIALS.map((m) => floorTextureUrl(m, "/"));
    expect(new Set(urls).size).toBe(FLOOR_MATERIALS.length);
  });
});

describe("texture assets", () => {
  it("ships exactly one PNG per material and no others", () => {
    const files = readdirSync(resolve(PUBLIC_DIR, FLOOR_TEXTURE_DIR)).sort();
    expect(files).toEqual([...FLOOR_MATERIALS].map((m) => `${m}.png`).sort());
  });

  it("serves each texture from public/ at exactly the URL the helper builds", () => {
    for (const material of FLOOR_MATERIALS) {
      const url = floorTextureUrl(material, "/hospitality/");
      const served = resolve(PUBLIC_DIR, url.replace("/hospitality/", ""));
      expect(served).toBe(texturePath(material));
    }
  });

  it("is never imported into the JS bundle — five PNGs would blow the size budget", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = readFileSync(full, "utf-8");
          // An `import … from "….png"` is what Vite turns into a bundled asset.
          if (/^\s*import\s[^;]*["'][^"']*\.png["']/m.test(text)) offenders.push(full);
        }
      }
    };
    walk(SRC_DIR);
    expect(offenders).toEqual([]);
  });

  it("is a 64x64 RGBA8 PNG, which is what the constant pattern scale assumes", () => {
    for (const material of FLOOR_MATERIALS) {
      const { width, height } = decodePng(readFileSync(texturePath(material)));
      expect({ material, width, height }).toEqual({
        material,
        width: TEXTURE_SOURCE_PX,
        height: TEXTURE_SOURCE_PX,
      });
    }
  });

  it("tiles at a whole number of grid cells so seams land on the grid", () => {
    expect(TEXTURE_TILE_PX % 20).toBe(0);
  });
});

/* ── Label contrast over the textures (measured, not assumed) ──────────
 * Decoded from the committed PNGs, so these are facts about the bytes that
 * ship, not estimates. They are what justifies SectionZone painting its name
 * on an opaque plate instead of straight onto the floor. */
describe("label contrast over every texture", () => {
  const extremes = (material: FloorMaterial) => {
    const { width, height, data } = decodePng(readFileSync(texturePath(material)));
    let min = 1;
    let max = 0;
    let minAlpha = 255;
    for (let i = 0; i < width * height; i++) {
      const l = relativeLuminance(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
      min = Math.min(min, l);
      max = Math.max(max, l);
      minAlpha = Math.min(minAlpha, data[i * 4 + 3]!);
    }
    return { min, max, minAlpha };
  };

  it("is fully opaque, so nothing below a texture can lighten or darken it", () => {
    for (const material of FLOOR_MATERIALS) {
      expect({ material, minAlpha: extremes(material).minAlpha }).toEqual({
        material,
        minAlpha: 255,
      });
    }
  });

  it("has no single text colour that clears 4.5:1 on all five", () => {
    // Against the worst-case pixel of each texture: white fails on the four
    // light/mid floors, black fails on carpet. This is the finding that rules
    // out "just pick a text colour" and requires the opaque plate below.
    const worstWhite = Math.min(...FLOOR_MATERIALS.map((m) => contrastRatio(1, extremes(m).max)));
    const worstBlack = Math.min(...FLOOR_MATERIALS.map((m) => contrastRatio(0, extremes(m).min)));
    expect(worstWhite).toBeLessThan(4.5);
    expect(worstBlack).toBeLessThan(4.5);
  });
});
