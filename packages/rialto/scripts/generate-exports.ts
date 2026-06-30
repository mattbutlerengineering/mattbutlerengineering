#!/usr/bin/env npx tsx
/**
 * Rewrites the `exports` field of packages/rialto/package.json to expose
 * one subpath per library entry — keeping it in sync with the canonical
 * component metadata produced by introspectComponents().
 *
 * Run after `vite build` so the exports map only references files that
 * exist in dist/lib.
 *
 * Run with --check to fail (non-zero exit) instead of writing — useful in
 * a precommit/CI-style verification.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { introspectComponents } from "./component-metadata.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_ROOT = path.resolve(here, "..");

interface ExportEntry {
  types?: string;
  import?: string;
  default?: string;
}

type ExportsMap = Record<string, string | ExportEntry>;

/**
 * Build the package.json exports map from the canonical component metadata.
 *
 * Component subpaths use `comp.subpath` (the directory name under
 * `src/components/`) so that the ./Toast entry is preserved even though
 * the exported component symbol is named `ToastProvider`.
 *
 * Byte-order comparator (NOT localeCompare) — locale-sensitive sorts
 * diverge between macOS and Linux CI.
 */
export function buildExportsMap(rootDir: string): ExportsMap {
  const exportsMap: ExportsMap = {};

  // Root barrel — preserved for back-compat.
  exportsMap["."] = {
    types: "./dist/lib/lib-entry.d.ts",
    import: "./dist/lib/rialto.js",
  };

  // Pre-existing named subpaths.
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

  // One subpath per component directory, derived from the canonical model.
  // Only include subpaths that actually correspond to a directory under
  // src/components/ with an index.ts — this excludes types and provider
  // symbols re-exported into the components barrel (e.g. RialtoProvider,
  // VibeName) whose declaration lives outside src/components/.
  const componentsDir = path.join(rootDir, "src/components");
  const components = introspectComponents(rootDir);
  const seen = new Set<string>();
  const componentEntries: Array<[string, ExportEntry]> = [];

  for (const comp of components) {
    const subpath = comp.subpath;
    if (seen.has(subpath)) continue;
    const indexPath = path.join(componentsDir, subpath, "index.ts");
    if (!fs.existsSync(indexPath)) continue;
    seen.add(subpath);
    componentEntries.push([
      `./${subpath}`,
      {
        types: `./dist/lib/components/${subpath}/index.d.ts`,
        import: `./dist/lib/components/${subpath}/index.js`,
      },
    ]);
  }

  // Sort component entries by byte-order (not localeCompare) to match CI.
  componentEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [key, value] of componentEntries) {
    exportsMap[key] = value;
  }

  // Static, non-component subpaths.
  exportsMap["./styles"] = {
    types: "./dist/lib/styles.d.ts",
    default: "./dist/lib/styles.css",
  };
  exportsMap["./manifest"] = "./dist/manifest.json";

  return exportsMap;
}

function writeStylesTypeStub(rootDir: string): void {
  const stubPath = path.join(rootDir, "dist", "lib", "styles.d.ts");
  if (!fs.existsSync(path.dirname(stubPath))) return;
  fs.writeFileSync(stubPath, "// Side-effect-only CSS bundle — no exported symbols.\nexport {};\n");
}

function loadPkg(rootDir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

function main(): void {
  const checkOnly = process.argv.includes("--check");
  if (!checkOnly) writeStylesTypeStub(SCRIPT_ROOT);
  const desired = buildExportsMap(SCRIPT_ROOT);
  const pkg = loadPkg(SCRIPT_ROOT);
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

  const pkgJsonPath = path.join(SCRIPT_ROOT, "package.json");
  pkg.exports = desired;
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  process.stdout.write(
    `[generate-exports] wrote ${Object.keys(desired).length} export entries to package.json\n`
  );
}

// Only run when executed directly (not when imported by tests or other modules).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
