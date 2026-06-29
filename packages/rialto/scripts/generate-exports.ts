#!/usr/bin/env npx tsx
/**
 * Rewrites the `exports` field of packages/rialto/package.json to expose
 * one subpath per library entry — keeping it in sync with whatever
 * `vite.config.lib.ts` actually built.
 *
 * Component subpaths are derived from `libEntries` in lib-entrypoints.ts,
 * which uses directory names as subpaths (e.g. "./Toast" from the Toast/
 * directory). This is distinct from component export names (e.g. "ToastProvider")
 * returned by introspectComponents() — the two can diverge when a directory
 * name doesn't match the exported identifier.
 *
 * Run with --check to fail (non-zero exit) instead of writing — useful in
 * a precommit/CI-style verification.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { libEntries } from "./lib-entrypoints.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const pkgJsonPath = path.join(repoRoot, "package.json");

/** Subpaths treated as static non-component entries. */
const STATIC_SUBPATHS = new Set([".", "motion", "providers", "hooks"]);

interface ExportEntry {
  types?: string;
  import?: string;
  default?: string;
}

type ExportsMap = Record<string, string | ExportEntry>;

/**
 * Pure render function: given the sorted list of component subpaths (directory
 * names, NOT export identifiers), produce the full package.json exports map.
 *
 * Non-component subpaths (root barrel, motion, providers, hooks, styles,
 * manifest) are hardcoded. Component entries are derived from `componentSubpaths`
 * using the deterministic dist path pattern.
 *
 * Sorting is the caller's responsibility — pass already-sorted subpaths to
 * get a deterministic map. `libEntries` from lib-entrypoints.ts is pre-sorted
 * with the byte-order comparator (NOT localeCompare).
 */
export function buildExports(componentSubpaths: string[]): ExportsMap {
  const exportsMap: ExportsMap = {};

  // ── Static non-component entries ──────────────────────────────────────────
  exportsMap["."] = {
    types: "./dist/lib/lib-entry.d.ts",
    import: "./dist/lib/rialto.js",
  };
  exportsMap["./motion"] = {
    types: "./dist/lib/tokens/motion.d.ts",
    import: "./dist/lib/motion.js",
  };
  exportsMap["./providers"] = {
    types: "./dist/lib/providers/index.d.ts",
    import: "./dist/lib/providers/index.js",
  };
  exportsMap["./hooks"] = {
    types: "./dist/lib/hooks/index.d.ts",
    import: "./dist/lib/hooks/index.js",
  };

  // ── Per-component entries ─────────────────────────────────────────────────
  for (const subpath of componentSubpaths) {
    exportsMap[`./${subpath}`] = {
      types: `./dist/lib/components/${subpath}/index.d.ts`,
      import: `./dist/lib/components/${subpath}/index.js`,
    };
  }

  // ── Static side-effect / meta entries ─────────────────────────────────────
  exportsMap["./styles"] = {
    types: "./dist/lib/styles.d.ts",
    default: "./dist/lib/styles.css",
  };
  exportsMap["./manifest"] = "./dist/manifest.json";

  return exportsMap;
}

function writeStylesTypeStub(): void {
  const stubPath = path.join(repoRoot, "dist", "lib", "styles.d.ts");
  if (!fs.existsSync(path.dirname(stubPath))) return;
  fs.writeFileSync(stubPath, "// Side-effect-only CSS bundle — no exported symbols.\nexport {};\n");
}

function loadPkg(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as Record<string, unknown>;
}

function main(): void {
  const checkOnly = process.argv.includes("--check");
  if (!checkOnly) writeStylesTypeStub();

  // Component subpaths come from libEntries (directory-based). This is the
  // canonical source for subpath names — component export identifiers (from
  // introspectComponents) can differ from their directory names (e.g. the
  // Toast/ directory exports ToastProvider, not Toast).
  const componentSubpaths = libEntries
    .filter((e) => !STATIC_SUBPATHS.has(e.subpath))
    .map((e) => e.subpath);

  const desired = buildExports(componentSubpaths);
  const pkg = loadPkg();
  const currentExports = pkg.exports;
  const currentJson = JSON.stringify(currentExports, null, 2);
  const desiredJson = JSON.stringify(desired, null, 2);

  if (currentJson === desiredJson) {
    process.stdout.write("[generate-exports] exports map already in sync.\n");
    return;
  }

  if (checkOnly) {
    process.stderr.write(
      "[generate-exports] package.json exports map is out of sync. " +
        "Run `pnpm exports` or `pnpm build` to regenerate.\n"
    );
    process.exit(1);
  }

  pkg.exports = desired;
  // Preserve key order: write back with 2-space indent + trailing newline
  // to match the rest of the file's style.
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  process.stdout.write(
    `[generate-exports] wrote ${Object.keys(desired).length} export entries to package.json\n`
  );
}

// Guard: only run main() when this script is executed directly, not when
// imported by tests. This prevents file-system side effects during test runs.
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
