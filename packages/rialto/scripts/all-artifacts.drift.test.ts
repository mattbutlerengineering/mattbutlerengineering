// @vitest-environment node
/**
 * Single drift test: one call to introspectComponents() regenerates all four
 * committed rialto artifacts byte-for-byte.
 *
 * This is the sole referee for generated-artifact correctness — one parse,
 * four assertions. Replaces the pairwise catalog drift check in
 * packages/rialto-catalog/src/__tests__/drift-check.test.ts.
 *
 * Artifacts:
 *   1. packages/rialto/registry.json            (byte-compare)
 *   2. packages/rialto/dist/manifest.json       (structural — generatedAt varies)
 *   3. packages/rialto/package.json exports     (byte-compare)
 *   4. packages/rialto-catalog/src/generated-schemas.ts (byte-compare via subprocess)
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { introspectComponents, type ComponentMetadata } from "./component-metadata.js";
import { buildRegistry } from "./generate-registry.js";
import { buildManifest } from "./generate-manifest.js";
import { buildExportsMap } from "./generate-exports.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RIALTO_ROOT = path.resolve(__dirname, "..");
const RIALTO_CATALOG_ROOT = path.resolve(RIALTO_ROOT, "../rialto-catalog");

describe("all-artifacts drift: single introspectComponents() parse, all four artifacts", () => {
  // Single parse shared by all tests below — the canonical model is loaded once.
  let components: ComponentMetadata[];
  let pkg: { version: string; exports?: unknown };

  beforeAll(() => {
    components = introspectComponents(RIALTO_ROOT);
    pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      version: string;
      exports?: unknown;
    };
  });

  // ── 1. registry.json ──────────────────────────────────────────────────────

  it("registry.json is byte-identical to committed version", () => {
    const registry = buildRegistry(components, pkg.version);
    const serialized = JSON.stringify(registry, null, 2) + "\n";
    const committed = fs.readFileSync(path.join(RIALTO_ROOT, "registry.json"), "utf-8");
    expect(serialized).toBe(committed);
  });

  // ── 2. dist/manifest.json ─────────────────────────────────────────────────
  // dist/manifest.json is not a committed artifact; generatedAt varies per run.
  // Verify the manifest matches the canonical model structurally.

  it("manifest.json component list matches the canonical model", () => {
    const manifest = buildManifest(components, pkg.version, new Date().toISOString());
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.components).toHaveLength(components.length);
    // Component names are in byte-order (not localeCompare)
    const names = manifest.components.map((c) => c.name);
    const expected = components.map((c) => c.name);
    expect(names).toEqual(expected);
  });

  // ── 3. package.json exports map ───────────────────────────────────────────

  it("package.json exports map matches buildExportsMap() output", () => {
    const desired = buildExportsMap(RIALTO_ROOT);
    const currentExports = pkg.exports;
    expect(JSON.stringify(currentExports, null, 2)).toBe(JSON.stringify(desired, null, 2));
  });

  // ── 4. generated-schemas.ts ───────────────────────────────────────────────
  // Run the catalog generator via subprocess (it runs in its own package context)
  // and compare against the committed artifact.

  it("generated-schemas.ts is byte-identical to committed version", { timeout: 120_000 }, () => {
    const schemasFile = path.join(RIALTO_CATALOG_ROOT, "src/generated-schemas.ts");
    const committed = fs.readFileSync(schemasFile, "utf-8");
    const schemasTmp = `${schemasFile}.drift-test-tmp`;

    try {
      execFileSync("npx", ["tsx", "./scripts/generate-catalog.ts"], {
        cwd: RIALTO_CATALOG_ROOT,
        env: { ...process.env, OUTPUT_FILE: schemasTmp },
        stdio: "pipe",
      });

      const regenerated = fs.readFileSync(schemasTmp, "utf-8");
      expect(regenerated.trim()).toBe(committed.trim());
    } finally {
      if (fs.existsSync(schemasTmp)) {
        fs.unlinkSync(schemasTmp);
      }
    }
  });
});
