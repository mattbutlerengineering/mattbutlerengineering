import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { countRialtoTokens } from "./src/data/rialto-tokens";

const require = createRequire(import.meta.url);

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
    const stylesheet = require.resolve("@mattbutlerengineering/rialto/styles");
    return countRialtoTokens(readFileSync(stylesheet, "utf-8"));
  } catch {
    const tokensDir = join(
      dirname(require.resolve("@mattbutlerengineering/rialto/package.json")),
      "src/tokens"
    );
    const css = readdirSync(tokensDir)
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(join(tokensDir, file), "utf-8"))
      .join("\n");
    return countRialtoTokens(css);
  }
}
