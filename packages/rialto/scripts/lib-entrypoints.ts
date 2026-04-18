/**
 * Single source of truth for which modules are emitted as separate
 * library entry points. Used by:
 *   - vite.config.lib.ts (build-time entry map)
 *   - scripts/generate-exports.ts (package.json exports map writer)
 *
 * Adding a new top-level component: just create
 * src/components/<Name>/index.ts and `pnpm build` picks it up.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

export interface LibEntry {
  /** Subpath segment after the package name, e.g. "Button" or "." for root. */
  subpath: string;
  /** Absolute path to the source entry. */
  source: string;
  /** Vite/Rollup chunk name (without extension). */
  chunkName: string;
}

const componentsDir = path.join(repoRoot, "src/components");

function listComponentEntries(): LibEntry[] {
  const dirents = fs.readdirSync(componentsDir, { withFileTypes: true });
  const entries: LibEntry[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    if (dirent.name.startsWith("_") || dirent.name.startsWith(".")) continue;
    const indexPath = path.join(componentsDir, dirent.name, "index.ts");
    if (!fs.existsSync(indexPath)) continue;
    entries.push({
      subpath: dirent.name,
      source: indexPath,
      // chunkName drives the emitted JS path. Putting it inside the
      // component's own folder (alongside the d.ts files emitted by
      // vite-plugin-dts) prevents TypeScript bundler resolution from
      // ever finding a sibling `.js` with no adjacent `.d.ts`.
      chunkName: `components/${dirent.name}/index`,
    });
  }
  entries.sort((a, b) => a.subpath.localeCompare(b.subpath));
  return entries;
}

const componentEntries = listComponentEntries();

/** All entries emitted by the library build, including root and side modules. */
export const libEntries: LibEntry[] = [
  // Root barrel — preserved for back-compat with `import { x } from "@.../rialto"`.
  {
    subpath: ".",
    source: path.join(repoRoot, "src/lib-entry.ts"),
    chunkName: "rialto",
  },
  // Pre-existing motion subpath.
  {
    subpath: "motion",
    source: path.join(repoRoot, "src/tokens/motion.ts"),
    chunkName: "motion",
  },
  // Providers subpath — RialtoProvider, useDeviceContext, vibes, etc.
  // chunkName uses /index so the emitted JS lands inside the same folder
  // as vite-plugin-dts's d.ts output (dist/lib/providers/) and TypeScript
  // bundler resolution finds the d.ts via folder fallback.
  {
    subpath: "providers",
    source: path.join(repoRoot, "src/providers/index.ts"),
    chunkName: "providers/index",
  },
  // Hooks subpath. Same /index treatment as providers.
  {
    subpath: "hooks",
    source: path.join(repoRoot, "src/hooks/index.ts"),
    chunkName: "hooks/index",
  },
  ...componentEntries,
];

/** Vite expects an object map of chunkName -> source path. */
export function viteEntryMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of libEntries) {
    out[entry.chunkName] = entry.source;
  }
  return out;
}
