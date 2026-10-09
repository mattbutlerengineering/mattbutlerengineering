import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ACTION = readFileSync(resolve(ROOT, ".github/actions/setup-workspace/action.yml"), "utf8");

/**
 * setup-workspace restores node_modules keyed on the pnpm-lock.yaml hash. It
 * used to also restore the pnpm store through setup-node's `cache: "pnpm"`,
 * keyed on the same hash with no restore-keys, so the store could only hit
 * when node_modules hit too, and then `pnpm install` reports "Already up to
 * date" without reading it. That was ~15s and 505MB per job (main run
 * 37527830915), paid three times in a row on Prepare → Typecheck → Test.
 */
describe("setup-workspace dependency cache", () => {
  it("does not also restore the pnpm store via setup-node", () => {
    expect(ACTION).not.toMatch(/^\s*cache:\s*["']?pnpm["']?\s*$/m);
  });

  it("still restores node_modules keyed on the lockfile", () => {
    expect(ACTION).toMatch(/key:\s*node-modules-\$\{\{\s*hashFiles\('pnpm-lock\.yaml'\)\s*\}\}/);
  });

  it("still runs a frozen-lockfile install", () => {
    expect(ACTION).toContain("pnpm install --frozen-lockfile");
  });
});
