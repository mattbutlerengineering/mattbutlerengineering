import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES } from "../regen-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/drift-fix.yml"), "utf8");

/**
 * Pull the `add-paths: |` block literal out of the workflow.
 *
 * Parsed textually rather than with a YAML library: nothing in `scripts/`
 * depends on one, and the block is a plain indented literal with no anchors,
 * merges, or flow syntax to get wrong.
 */
function addPathsGlobs(source) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => /^\s*add-paths:\s*\|\s*$/.test(l));
  if (start === -1) throw new Error("drift-fix.yml has no `add-paths: |` block");

  const indent = lines[start].match(/^(\s*)/)[1].length;
  const globs = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    // The block ends at the first line indented no further than the key.
    if (line.match(/^(\s*)/)[1].length <= indent) break;
    globs.push(line.trim());
  }
  return globs;
}

/** Translate a create-pull-request add-path glob into an anchored regex. */
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

describe("drift-fix workflow", () => {
  const globs = addPathsGlobs(WORKFLOW);
  const manifestOutputs = [...new Set(FAMILIES.flatMap((f) => f.outputs ?? []))];

  it("stages every artifact the regen manifest can produce", () => {
    // The manifest is the source of truth for what `pnpm regen` writes. If a
    // new package lands there but its artifact is not matched by an add-path,
    // the daily job regenerates it and then silently drops it from the commit —
    // a drift fix that leaves the drift in place, with a green run to hide it.
    const matchers = globs.map(globToRegExp);
    const uncovered = manifestOutputs.filter((out) => !matchers.some((re) => re.test(out)));

    expect(uncovered, `add-paths in drift-fix.yml misses: ${uncovered.join(", ")}`).toEqual([]);
  });

  it("lists repo-root artifacts explicitly rather than by glob", () => {
    // `**/llms.txt`-style globs do not match a file at the repo root, which is
    // how root llms artifacts have been dropped from staging before.
    for (const rootFile of ["llms.txt", "llms-full.txt"]) {
      expect(globs, `${rootFile} must be listed as a bare path`).toContain(rootFile);
    }
  });

  it("does not stage the whole tree", () => {
    // `pnpm install` reflows ~150 tracked files through prettier in this repo.
    // A catch-all add-path would sweep that reformatting into the drift PR.
    for (const glob of globs) {
      expect(glob).not.toBe(".");
      expect(glob).not.toBe("*");
      expect(glob).not.toMatch(/^\*\*\/?\*?$/);
    }
  });

  it("builds the CLI before regenerating", () => {
    // Without a built @mbe/cli (and its transitive @mbe/agent-core), the llms
    // families' `mbe pack` call throws ERR_MODULE_NOT_FOUND, regen-llms.sh
    // swallows it, and regen no-ops silently — a green run that fixed nothing.
    const buildAt = WORKFLOW.indexOf("pnpm build --filter @mbe/cli...");
    const regenAt = WORKFLOW.indexOf("run: pnpm regen\n");

    expect(buildAt, "workflow must build @mbe/cli before regen").toBeGreaterThan(-1);
    expect(regenAt).toBeGreaterThan(-1);
    expect(buildAt).toBeLessThan(regenAt);
  });

  it("dispatches CI, because GITHUB_TOKEN PRs do not trigger it", () => {
    // GitHub's anti-recursion rule means a GITHUB_TOKEN-authored PR never fires
    // `pull_request` workflows, so the required CI Gate check never appears and
    // the PR sits BLOCKED forever. workflow_dispatch is the documented exception.
    expect(WORKFLOW).toMatch(/gh workflow run ci\.yml --ref automation\/drift-fix/);
    expect(WORKFLOW).toMatch(/actions:\s*write/);
  });
});
