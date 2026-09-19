import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { countRialtoTokens } from "./src/data/rialto-tokens";

const require = createRequire(import.meta.url);
const RIALTO_PACKAGE_NAME = "@mattbutlerengineering/rialto";

/**
 * Find the on-disk root of a scoped package among a list of candidate
 * `node_modules` search paths (as returned by `require.resolve.paths`),
 * without going through `require.resolve`'s `exports`-map enforcement —
 * unlike a subpath resolve, this can locate a package's root even when its
 * `package.json` has no `"./package.json"` entry in `exports`.
 */
export function findScopedPackageRoot(
  searchPaths: readonly string[],
  packageName: string,
  fileExists: (path: string) => boolean
): string | undefined {
  for (const base of searchPaths) {
    const candidate = join(base, packageName);
    if (fileExists(join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Resolve the number of design tokens Rialto ships, read from its compiled
 * stylesheet at build time. Injected into the app via the `__RIALTO_TOKEN_COUNT__`
 * define (see vite.config.ts / vitest.config.ts) so the Overview stat row never
 * advertises a stale hardcoded number.
 *
 * Falls back to the committed token CSS sources when the package is not yet
 * built, so `vite`/`vitest` can always load their config.
 */
export function resolveRialtoTokenCount(): number {
  try {
    const stylesheet = require.resolve(`${RIALTO_PACKAGE_NAME}/styles`);
    return countRialtoTokens(readFileSync(stylesheet, "utf-8"));
  } catch {
    const searchPaths = require.resolve.paths(RIALTO_PACKAGE_NAME) ?? [];
    const packageRoot = findScopedPackageRoot(searchPaths, RIALTO_PACKAGE_NAME, existsSync);
    if (!packageRoot) {
      throw new Error(`Could not resolve ${RIALTO_PACKAGE_NAME} package root`);
    }
    const tokensDir = join(packageRoot, "src/tokens");
    const css = readdirSync(tokensDir)
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(join(tokensDir, file), "utf-8"))
      .join("\n");
    return countRialtoTokens(css);
  }
}
