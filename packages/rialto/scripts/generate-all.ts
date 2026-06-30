#!/usr/bin/env npx tsx
/**
 * Single-parse artifact orchestrator for packages/rialto.
 *
 * Calls introspectComponents() ONCE and passes the result to every generator
 * that consumes the canonical ComponentMetadata model, then updates the
 * exports map. Replaces three separate script invocations (build:registry,
 * manifest, exports) with one unified build step:
 *
 *   pnpm build  →  vite build && tsx scripts/generate-all.ts
 *
 * Artifacts written:
 *   registry.json           ← buildRegistry(components, version)
 *   dist/manifest.json      ← buildManifest(components, version, now)
 *   package.json exports    ← buildExportsMap()
 *
 * Usage: npx tsx scripts/generate-all.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { introspectComponents } from "./component-metadata.js";
import { buildRegistry } from "./generate-registry.js";
import { buildManifest } from "./generate-manifest.js";
import { buildExportsMap } from "./generate-exports.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function main(): void {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")) as {
    version: string;
  };

  // Single parse — shared by every generator that needs component metadata.
  const components = introspectComponents(rootDir);

  // ── registry.json ──────────────────────────────────────────────────────────
  const registry = buildRegistry(components, pkg.version);
  const registryPath = path.join(rootDir, "registry.json");
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
  console.log(`Generated registry: ${components.length} components → ${registryPath}`);

  // ── dist/manifest.json ─────────────────────────────────────────────────────
  const manifestPath = path.join(rootDir, "dist/manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const manifest = buildManifest(components, pkg.version, new Date().toISOString());
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Generated manifest: ${components.length} components → ${manifestPath}`);

  // ── package.json exports ───────────────────────────────────────────────────
  // buildExportsMap() reads src/components/ to derive lib entries — no TS parse.
  const exportsMap = buildExportsMap();
  const pkgFull = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")
  ) as Record<string, unknown>;

  const currentExports = JSON.stringify(pkgFull.exports, null, 2);
  const desiredExports = JSON.stringify(exportsMap, null, 2);

  if (currentExports !== desiredExports) {
    pkgFull.exports = exportsMap;
    fs.writeFileSync(path.join(rootDir, "package.json"), JSON.stringify(pkgFull, null, 2) + "\n");
    console.log(
      `[generate-all] wrote ${Object.keys(exportsMap).length} export entries to package.json`
    );
  } else {
    console.log("[generate-all] exports map already in sync.");
  }
}

main();
