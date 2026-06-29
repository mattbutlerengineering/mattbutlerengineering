// @vitest-environment node
/**
 * Tests for the generate-exports.ts buildExports pure render function.
 *
 * Verifies that buildExports() consumes component subpaths (directory-based
 * names from lib-entrypoints) and produces an exports map that is
 * byte-identical to the committed package.json exports.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { libEntries } from "./lib-entrypoints.js";
import { buildExports } from "./generate-exports.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RIALTO_ROOT = path.resolve(__dirname, "..");

/** Subpaths treated as non-component static entries. */
const STATIC_SUBPATHS = new Set([".", "motion", "providers", "hooks"]);

/** Component directory names (sorted by byte-order via libEntries). */
const componentSubpaths = libEntries
  .filter((e) => !STATIC_SUBPATHS.has(e.subpath))
  .map((e) => e.subpath);

describe("buildExports", () => {
  it("produces byte-identical exports map to the committed package.json", () => {
    const result = buildExports(componentSubpaths);

    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      exports: Record<string, unknown>;
    };

    expect(JSON.stringify(result, null, 2)).toBe(JSON.stringify(pkg.exports, null, 2));
  });

  it("includes all four static non-component entries when given an empty list", () => {
    const result = buildExports([]);
    expect(result["."]).toEqual({
      types: "./dist/lib/lib-entry.d.ts",
      import: "./dist/lib/rialto.js",
    });
    expect(result["./motion"]).toEqual({
      types: "./dist/lib/tokens/motion.d.ts",
      import: "./dist/lib/motion.js",
    });
    expect(result["./providers"]).toEqual({
      types: "./dist/lib/providers/index.d.ts",
      import: "./dist/lib/providers/index.js",
    });
    expect(result["./hooks"]).toEqual({
      types: "./dist/lib/hooks/index.d.ts",
      import: "./dist/lib/hooks/index.js",
    });
    expect(result["./styles"]).toEqual({
      types: "./dist/lib/styles.d.ts",
      default: "./dist/lib/styles.css",
    });
    expect(result["./manifest"]).toBe("./dist/manifest.json");
  });

  it("maps each component subpath to the deterministic dist paths", () => {
    const result = buildExports(["Button"]);
    expect(result["./Button"]).toEqual({
      types: "./dist/lib/components/Button/index.d.ts",
      import: "./dist/lib/components/Button/index.js",
    });
  });

  it("uses directory-based subpath name for Toast (not the ToastProvider export name)", () => {
    // Toast/ directory → ./Toast subpath, not ./ToastProvider.
    // This verifies the directory-name approach is used, not the export-name approach.
    expect(componentSubpaths).toContain("Toast");
    const result = buildExports(["Toast"]);
    expect(result["./Toast"]).toEqual({
      types: "./dist/lib/components/Toast/index.d.ts",
      import: "./dist/lib/components/Toast/index.js",
    });
  });
});
