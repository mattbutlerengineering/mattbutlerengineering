import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { countRialtoComponents } from "./src/data/rialto-components";

const require = createRequire(import.meta.url);

/**
 * Resolve the number of components Rialto ships, read from its compiled
 * manifest at build time. Injected into the app via the
 * `__RIALTO_COMPONENT_COUNT__` define (see vite.config.ts / vitest.config.ts)
 * so the Overview stat row never advertises a stale hardcoded number —
 * without shipping the manifest's ~110 KiB of per-component descriptions,
 * prop tables, and character-limit metadata to the client just to read one
 * integer off it (#4836).
 *
 * Unlike `resolveRialtoTokenCount`, there's no uncompiled fallback here: the
 * manifest is a generated artifact (TSDoc introspected via the TypeScript
 * compiler API in packages/rialto/scripts/generate-manifest.ts), not a raw
 * source file this config can read directly. Run
 * `pnpm --dir packages/rialto build` first.
 */
export function resolveRialtoComponentCount(): number {
  const manifestPath = require.resolve("@mattbutlerengineering/rialto/manifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    components: readonly unknown[];
  };
  return countRialtoComponents(manifest);
}
