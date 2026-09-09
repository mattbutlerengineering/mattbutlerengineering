import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readJson = (rel) => JSON.parse(readFileSync(resolve(__dirname, "..", rel), "utf8"));

describe("scripts/ turbo lint gate wiring", () => {
  // scripts/** used to be unlinted for two independent reasons, and closing
  // either alone accomplished nothing (docs/backlog.md): no lint script here
  // (turbo never visited the package) and no eslint step for staged .mjs
  // (pinned in lint-staged-config.test.mjs). These pin the turbo half.
  it("declares a lint script so `turbo run lint` visits @mbe/scripts", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts.lint).toContain("eslint");
  });

  it("declares the linted files as turbo inputs so a cached green cannot go stale", () => {
    // Root turbo.json's lint inputs are src/**-shaped; this package's sources
    // are top-level .mjs/.js, so without an override the lint task hash would
    // be byte-identical before and after breaking any of them — the same
    // class as the test-inputs entry in docs/backlog.md.
    const turbo = readJson("turbo.json");
    expect(turbo.extends).toEqual(["//"]);
    expect(turbo.tasks.lint.inputs).toContain("**/*.{js,mjs,cjs}");
  });
});
