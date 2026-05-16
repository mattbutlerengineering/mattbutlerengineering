#!/usr/bin/env npx tsx
/**
 * Rewrites the `exports` field of packages/rialto/package.json to expose
 * one subpath per library entry — keeping it in sync with whatever
 * `vite.config.lib.ts` actually built.
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

import { libEntries } from "./lib-entrypoints.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const pkgJsonPath = path.join(repoRoot, "package.json");

interface ExportEntry {
  types?: string;
  import?: string;
  default?: string;
}

type ExportsMap = Record<string, string | ExportEntry>;

function buildExportsMap(): ExportsMap {
  const exportsMap: ExportsMap = {};

  for (const entry of libEntries) {
    // chunkName already includes any "/index" suffix where applicable.
    const jsRelative = `./dist/lib/${entry.chunkName}.js`;
    // d.ts location:
    //   - root barrel: dist/lib/lib-entry.d.ts
    //   - motion: dist/lib/tokens/motion.d.ts
    //   - hooks: dist/lib/hooks/index.d.ts
    //   - providers: dist/lib/providers/index.d.ts
    //   - components/<Name>: dist/lib/components/<Name>/index.d.ts
    let typesRelative: string;
    if (entry.subpath === ".") {
      typesRelative = "./dist/lib/lib-entry.d.ts";
    } else if (entry.subpath === "motion") {
      typesRelative = "./dist/lib/tokens/motion.d.ts";
    } else if (entry.subpath === "hooks") {
      typesRelative = "./dist/lib/hooks/index.d.ts";
    } else if (entry.subpath === "providers") {
      typesRelative = "./dist/lib/providers/index.d.ts";
    } else {
      typesRelative = `./dist/lib/components/${entry.subpath}/index.d.ts`;
    }
    const key = entry.subpath === "." ? "." : `./${entry.subpath}`;
    exportsMap[key] = {
      types: typesRelative,
      import: jsRelative,
    };
  }

  // Static, non-component subpaths.
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
  fs.writeFileSync(
    stubPath,
    "// Side-effect-only CSS bundle — no exported symbols.\nexport {};\n"
  );
}

function loadPkg(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as Record<string, unknown>;
}

function main(): void {
  const checkOnly = process.argv.includes("--check");
  if (!checkOnly) writeStylesTypeStub();
  const desired = buildExportsMap();
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

main();
