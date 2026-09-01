/**
 * Static-source regression gate for #4836: the eagerly-loaded overview route
 * (OverviewPage + ShowcaseLayout — the only two routes in routes.tsx that are
 * NOT React.lazy, deliberately, to avoid a double lazy-load waterfall on
 * /rialto) must never import `@mattbutlerengineering/rialto/manifest`.
 *
 * The manifest carries every shipped component's full description, prop
 * table, and character-limit metadata — ~110 KiB minified — of which the
 * Overview page's stat row only ever needed a single integer
 * (`manifest.components.length`). Importing it here bloated the eager entry
 * chunk with data the route never renders, which is exactly what Lighthouse's
 * `unused-javascript` audit flags. The component count is derived at build
 * time instead (see component-count.config.ts / __RIALTO_COMPONENT_COUNT__);
 * `PropsTable.tsx`, which genuinely needs the full manifest to render prop
 * tables, is only reachable from lazy-loaded demo/component routes and is
 * deliberately outside this scan.
 *
 * This walks the real static import graph from the two eager entry files
 * (relative imports only — node_modules/workspace-package boundaries are not
 * followed) rather than special-casing OverviewPage.tsx by name, so a future
 * eager-route refactor that moves the manifest import into a helper module
 * still trips this gate.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, "../src");

const EAGER_ENTRY_FILES = [
  path.join(SRC_DIR, "pages/OverviewPage.tsx"),
  path.join(SRC_DIR, "layouts/ShowcaseLayout.tsx"),
];

const RELATIVE_IMPORT = /from\s+["'](\.[^"']+)["']/g;
const BANNED_SPECIFIER = "@mattbutlerengineering/rialto/manifest";
const RESOLVE_EXTENSIONS = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveRelativeImport(fromFile: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

/** Walk the local (relative-import-only) static module graph from a set of entry files. */
function walkEagerGraph(entryFiles: readonly string[]): Map<string, string> {
  const visited = new Map<string, string>();
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || visited.has(file)) continue;

    const content = fs.readFileSync(file, "utf-8");
    visited.set(file, content);

    for (const match of content.matchAll(RELATIVE_IMPORT)) {
      const resolved = resolveRelativeImport(file, match[1]);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return visited;
}

describe("eager overview route: rialto manifest import (#4836)", () => {
  const graph = walkEagerGraph(EAGER_ENTRY_FILES);

  it("reaches more than just the two entry files, so this gate can't silently no-op", () => {
    expect(graph.size).toBeGreaterThan(EAGER_ENTRY_FILES.length);
  });

  it("no file reachable from the eager overview route imports the rialto manifest", () => {
    const offenders = [...graph.entries()]
      .filter(([, content]) => content.includes(BANNED_SPECIFIER))
      .map(([file]) => path.relative(SRC_DIR, file));
    expect(offenders).toEqual([]);
  });
});
