import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = resolve(__dirname, "../package.json");

// Regression test for #4853: apps/rialto-web's build script prebuilt only
// @mbe/api-client (#4845), which is sufficient today only because the
// consumed subpath (@mbe/api-client/streaming) is currently a leaf with no
// @mbe/types import. apps/gen proved that edge is a real, natural
// evolution (#4850) — the moment a consumed api-client subpath grows a
// @mbe/types import, a direct `pnpm --dir apps/rialto-web build` breaks one
// edge deeper with no gate going red first, because @mbe/types' package.json
// exports point "default" at dist/*.js with no src fallback. Pin the full
// prebuild chain (types -> api-client -> app) so that class of breakage
// can't reintroduce silently.
describe("rialto-web build script", () => {
  it("prebuilds @mbe/types and @mbe/api-client before tsc -b && vite build", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8"));

    expect(
      pkg.scripts.build.startsWith(
        "pnpm --filter @mbe/types build && pnpm --filter @mbe/api-client build && "
      )
    ).toBe(true);
    expect(pkg.scripts.build.endsWith("tsc -b && vite build")).toBe(true);
  });
});
