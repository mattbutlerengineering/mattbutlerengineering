import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function writeWorkflow(root, name, content) {
  const dir = path.join(root, ".github", "workflows");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

/** A workflow that opens a PR with `gh pr create` and dispatches CI afterwards. */
const COMPLIANT_GH_CLI = `name: Example
permissions:
  contents: write
  pull-requests: write
  actions: write
jobs:
  open:
    runs-on: ubuntu-latest
    steps:
      - run: |
          git push origin "$BRANCH"
          gh pr create --base main --head "$BRANCH" --title t --body b
          gh workflow run ci.yml --ref "$BRANCH"
`;

describe("check-ci-dispatch", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-dispatch-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("checkWorkflow", () => {
    test("is not applicable when the workflow never opens a PR", async () => {
      const { checkWorkflow } = await import("../check-ci-dispatch.mjs");
      const result = checkWorkflow(
        "ci.yml",
        "name: CI\njobs:\n  build:\n    steps:\n      - run: pnpm build\n"
      );

      expect(result.createsPr).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    test("reports a workflow that opens a PR with gh pr create but never dispatches CI", async () => {
      const { checkWorkflow } = await import("../check-ci-dispatch.mjs");
      const result = checkWorkflow(
        "revert-watchdog.yml",
        `name: Revert Watchdog
permissions:
  contents: write
  pull-requests: write
jobs:
  revert:
    steps:
      - run: |
          gh pr create --base main --head "$BRANCH" --title t --body b
`
      );

      expect(result.createsPr).toBe(true);
      expect(result.dispatchesCi).toBe(false);
      expect(result.errors).toEqual([expect.stringContaining("gh workflow run ci.yml")]);
    });

    test("reports a workflow that opens a PR with peter-evans/create-pull-request but never dispatches CI", async () => {
      const { checkWorkflow } = await import("../check-ci-dispatch.mjs");
      const result = checkWorkflow(
        "auto-qa-tune.yml",
        `name: Tune
permissions:
  contents: write
  pull-requests: write
jobs:
  tune:
    steps:
      - uses: peter-evans/create-pull-request@5f6978f # v8.1.1
        with:
          branch: automation/auto-qa-tuning
`
      );

      expect(result.createsPr).toBe(true);
      expect(result.dispatchesCi).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    test("accepts a workflow that opens a PR and dispatches CI with actions: write", async () => {
      const { checkWorkflow } = await import("../check-ci-dispatch.mjs");
      const result = checkWorkflow("example.yml", COMPLIANT_GH_CLI);

      expect(result.createsPr).toBe(true);
      expect(result.dispatchesCi).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("reports a dispatching workflow that lacks the actions: write permission", async () => {
      const { checkWorkflow } = await import("../check-ci-dispatch.mjs");
      const result = checkWorkflow(
        "example.yml",
        COMPLIANT_GH_CLI.replace("  actions: write\n", "")
      );

      expect(result.createsPr).toBe(true);
      expect(result.dispatchesCi).toBe(true);
      expect(result.errors).toEqual([expect.stringContaining("actions: write")]);
    });
  });

  describe("findCiDispatchFindings", () => {
    test("passes when every PR-opening workflow dispatches CI", async () => {
      writeWorkflow(tmpDir, "example.yml", COMPLIANT_GH_CLI);
      writeWorkflow(tmpDir, "ci.yml", "name: CI\njobs:\n  build:\n    steps: []\n");

      const { findCiDispatchFindings } = await import("../check-ci-dispatch.mjs");
      const { results, findings } = findCiDispatchFindings(tmpDir);

      expect(findings).toHaveLength(0);
      expect(results.filter((r) => r.createsPr)).toHaveLength(1);
    });

    test("collects one finding per offending workflow", async () => {
      writeWorkflow(tmpDir, "example.yml", COMPLIANT_GH_CLI);
      writeWorkflow(
        tmpDir,
        "changelog.yml",
        `name: Changelog
permissions:
  contents: write
jobs:
  changelog:
    steps:
      - run: gh pr create --title t --body b
`
      );

      const { findCiDispatchFindings } = await import("../check-ci-dispatch.mjs");
      const { findings } = findCiDispatchFindings(tmpDir);

      expect(findings).toHaveLength(1);
      expect(findings[0].workflow).toBe("changelog.yml");
    });

    test("returns no findings when the workflows directory does not exist", async () => {
      const { findCiDispatchFindings } = await import("../check-ci-dispatch.mjs");
      const { results, findings } = findCiDispatchFindings(path.join(tmpDir, "nope"));

      expect(results).toHaveLength(0);
      expect(findings).toHaveLength(0);
    });
  });

  describe("the real repository", () => {
    test("every workflow that opens a PR dispatches CI on its branch", async () => {
      const repoRoot = path.resolve(import.meta.dirname, "..", "..");
      const { findCiDispatchFindings } = await import("../check-ci-dispatch.mjs");
      const { findings } = findCiDispatchFindings(repoRoot);

      expect(findings.map((f) => `${f.workflow}: ${f.error}`)).toEqual([]);
    });
  });
});
