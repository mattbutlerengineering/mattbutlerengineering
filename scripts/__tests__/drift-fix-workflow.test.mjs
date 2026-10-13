import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/drift-fix.yml"), "utf8");

describe("drift-fix workflow", () => {
  it("stages the manifest's own path set (resolved at run time, never restated)", () => {
    // The path list is produced by `regen-manifest.mjs --paths` and fed to
    // create-pull-request; the derivation itself is tested in
    // regen-consumers.test.mjs. Here we pin the wiring.
    expect(WORKFLOW).toMatch(/id: artifact-paths/);
    expect(WORKFLOW).toMatch(/add-paths: \$\{\{ steps\.artifact-paths\.outputs\.paths \}\}/);
  });

  it("does not stage the whole tree", () => {
    // `pnpm install` reflows ~150 tracked files through prettier in this repo.
    // A catch-all add-path would sweep that reformatting into the drift PR.
    expect(WORKFLOW).not.toMatch(/add-paths:\s*(\.|\*|\*\*)\s*$/m);
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
