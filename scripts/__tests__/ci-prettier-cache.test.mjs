import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/**
 * `pnpm repo-audit`'s prettier check took 41s of the Build job on main run
 * 37527830915. Prettier's cache (on by default, node_modules/.cache/prettier)
 * cuts a warm run to ~1s locally, but the node_modules cache only saves on a
 * lockfile miss, so CI never kept it. The cache is keyed on file content: a
 * file whose content changed with its mtime held is still re-checked (measured
 * 2026-10-06), so restoring an older commit's cache cannot false-pass a PR.
 * The key still rotates on the lockfile (prettier version, plugins) and on
 * the prettier config, so a formatting-rule change never reuses old verdicts.
 */
function jobBlock(jobName) {
  const lines = WORKFLOW.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^ {2}${jobName}:\\s*$`).test(l));
  if (start === -1) throw new Error(`ci.yml has no \`${jobName}:\` job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

describe("ci.yml Build prettier cache", () => {
  const build = jobBlock("build");
  const cacheStep = build
    .split(/\n(?= {6}- )/)
    .find((step) => /path:\s*node_modules\/\.cache\/prettier/.test(step));

  it("restores prettier's cache in the Build job", () => {
    expect(cacheStep, "no cache step for node_modules/.cache/prettier").toBeDefined();
  });

  it("keys it on the lockfile and the prettier config", () => {
    expect(cacheStep).toMatch(/key:.*hashFiles\([^)]*pnpm-lock\.yaml/);
    expect(cacheStep).toMatch(/key:.*hashFiles\([^)]*\.prettierrc\.js/);
    expect(cacheStep).toMatch(/key:.*hashFiles\([^)]*\.prettierignore/);
  });

  it("restores it before the repo audit runs", () => {
    const cache = build.indexOf("node_modules/.cache/prettier");
    expect(cache).toBeGreaterThan(-1);
    expect(cache).toBeLessThan(build.indexOf("pnpm repo-audit"));
  });
});
