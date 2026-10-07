import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const { scripts } = JSON.parse(readFileSync(resolve(ROOT, "scripts/package.json"), "utf8"));

/**
 * A test file kept out of the coverage pass must still run.
 *
 * v8 block coverage slows every JS pixel loop in the process ~8x, so
 * visual-defect-reproduction.test.mjs (99 whole-image decode/shift/compare
 * cases) took ~145s under `--coverage` locally against ~18s without, and
 * timed out on main (run 37416547647). Its coverage contribution is nil:
 * visual-noise-floor.mjs and visual-tolerance.mjs measure 139/177 and 52/52
 * statements with or without it. So `test:coverage` runs it in a second,
 * uninstrumented pass. This pins that the second pass exists — an exclusion
 * without it would be a gate that silently stopped running.
 */
describe("scripts test:coverage exclusions", () => {
  const command = scripts["test:coverage"];
  const passes = command.split("&&").map((s) => s.trim());
  const coveragePass = passes.find((p) => p.includes("--coverage"));
  const excluded = [...coveragePass.matchAll(/--exclude\s+(\S+)/g)].map((m) => m[1]);

  it("excludes at least the visual defect reproduction from the coverage pass", () => {
    expect(excluded).toContain("scripts/__tests__/visual-defect-reproduction.test.mjs");
  });

  it.each(excluded)("%s still runs in a non-coverage vitest pass", (file) => {
    expect(existsSync(resolve(ROOT, file))).toBe(true);
    const runner = passes.find(
      (p) => p.startsWith("vitest run") && !p.includes("--coverage") && p.includes(file)
    );
    expect(runner, `${file} is excluded from coverage but never run`).toBeDefined();
    // Its own junit file, so it does not overwrite the coverage pass's results.
    expect(runner).toMatch(/--outputFile\.junit=scripts\/test-results\/\S+\.xml/);
  });
});
