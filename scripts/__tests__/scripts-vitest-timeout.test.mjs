import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SCRIPTS_CONFIG = resolve(ROOT, "scripts/vitest.config.mjs");
const ROOT_CONFIG = resolve(ROOT, "vitest.config.ts");

/**
 * vitest's default testTimeout is 5s. A pnpm-lock.yaml change cold-busts every
 * turbo task, and the resulting fully-parallel run tips marginal suites over the
 * default (gotchas.md § Build / pnpm / turbo). The repo fix is an explicit
 * testTimeout on the config that owns each suite. Root vitest.config.ts is only
 * an aggregator of `projects`, and project-level test options are not inherited
 * from it, so the timeout must live in scripts/vitest.config.mjs itself.
 */
const MIN_TIMEOUT_MS = 15000;

describe("scripts/vitest.config.mjs testTimeout", () => {
  it("declares a testTimeout above vitest's 5s default", async () => {
    const { default: config } = await import(pathToFileURL(SCRIPTS_CONFIG).href);
    expect(config.test.testTimeout).toBeGreaterThanOrEqual(MIN_TIMEOUT_MS);
  });

  it("is referenced by the root vitest.config.ts projects list", () => {
    // If the root stops aggregating this config, the timeout stops applying to a
    // root-level `vitest` run, and this guard would be checking a file nothing reads.
    expect(readFileSync(ROOT_CONFIG, "utf8")).toContain('"scripts/vitest.config.mjs"');
  });
});
