import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Guard for #4225: four scheduled workflows ran `node <script>` after a bare
 * `actions/setup-node` step — no `pnpm install`, so any bare import
 * (`@mbe/gh-client`, `@mbe/agent-core`, or plain npm `prettier` reached one
 * relative hop deep via `plugins/acmm/scripts/state.js`) failed with
 * `ERR_MODULE_NOT_FOUND`. This scans every `node <script>` invocation in
 * `.github/workflows/*.yml`, follows the script's import graph, and flags a
 * workflow that reaches a bare specifier without installing dependencies
 * first.
 */

function writeWorkflow(root, name, content) {
  const dir = path.join(root, ".github", "workflows");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

function writeScript(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

describe("check-workflow-deps", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-deps-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("collectReachableBareSpecifiers", () => {
    test("returns the bare specifier a script imports directly", async () => {
      writeScript(tmpDir, "scripts/foo.mjs", 'import { createGhClient } from "@mbe/gh-client";\n');

      const { collectReachableBareSpecifiers } = await import("../check-workflow-deps.mjs");
      const specifiers = collectReachableBareSpecifiers(path.join(tmpDir, "scripts/foo.mjs"));

      expect([...specifiers]).toEqual(["@mbe/gh-client"]);
    });

    test("follows a relative import one hop deep to find a bare specifier — the auto-issue/state.js case", async () => {
      writeScript(
        tmpDir,
        "plugins/acmm/scripts/audit.js",
        'import { loadState } from "./state.js";\n'
      );
      writeScript(tmpDir, "plugins/acmm/scripts/state.js", 'import prettier from "prettier";\n');

      const { collectReachableBareSpecifiers } = await import("../check-workflow-deps.mjs");
      const specifiers = collectReachableBareSpecifiers(
        path.join(tmpDir, "plugins/acmm/scripts/audit.js")
      );

      expect([...specifiers]).toEqual(["prettier"]);
    });

    test("does not report node builtins as bare specifiers", async () => {
      writeScript(
        tmpDir,
        "scripts/foo.mjs",
        'import { readFileSync } from "node:fs";\nimport path from "path";\n'
      );

      const { collectReachableBareSpecifiers } = await import("../check-workflow-deps.mjs");
      const specifiers = collectReachableBareSpecifiers(path.join(tmpDir, "scripts/foo.mjs"));

      expect([...specifiers]).toEqual([]);
    });

    test("never mistakes a quoted phrase inside a comment for a real import specifier", async () => {
      // Regression case found while building this guard: a lazy `import
      // ... from "..."` regex matched straight through a JSDoc comment to
      // an unrelated quoted phrase in scripts/merge-queue-eligibility.mjs —
      // `from "never classified at all"` — and reported it as a bare
      // specifier. The real file already exercises this below; this
      // fixture reproduces the shape directly so the regression can't come
      // back unnoticed.
      writeScript(
        tmpDir,
        "scripts/foo.mjs",
        [
          'import { fileURLToPath } from "node:url";',
          "",
          "/**",
          " * Distinguishes 'classified as low-risk' from \"never classified at all\".",
          " */",
          'export const TIER_LABEL_PREFIX = "tier:";',
          "",
        ].join("\n")
      );

      const { collectReachableBareSpecifiers } = await import("../check-workflow-deps.mjs");
      const specifiers = collectReachableBareSpecifiers(path.join(tmpDir, "scripts/foo.mjs"));

      expect([...specifiers]).toEqual([]);
    });
  });

  describe("checkWorkflowDeps", () => {
    test("flags a workflow that runs a dependency-needing script with a bare setup-node step", async () => {
      writeScript(tmpDir, "scripts/foo.mjs", 'import { createGhClient } from "@mbe/gh-client";\n');
      const content = [
        "name: Foo",
        "jobs:",
        "  audit:",
        "    steps:",
        "      - uses: actions/checkout@v7.0.1",
        "      - uses: actions/setup-node@v7.0.0",
        "      - run: node scripts/foo.mjs",
        "",
      ].join("\n");

      const { checkWorkflowDeps } = await import("../check-workflow-deps.mjs");
      const result = checkWorkflowDeps("foo.yml", content, tmpDir);

      expect(result.installsDeps).toBe(false);
      expect(result.bareSpecifiers).toEqual(["@mbe/gh-client"]);
      expect(result.errors).toHaveLength(1);
    });

    test("passes a workflow that uses the shared setup-workspace composite action", async () => {
      writeScript(tmpDir, "scripts/foo.mjs", 'import { createGhClient } from "@mbe/gh-client";\n');
      const content = [
        "name: Foo",
        "jobs:",
        "  audit:",
        "    steps:",
        "      - uses: actions/checkout@v7.0.1",
        "      - uses: ./.github/actions/setup-workspace",
        "      - run: node scripts/foo.mjs",
        "",
      ].join("\n");

      const { checkWorkflowDeps } = await import("../check-workflow-deps.mjs");
      const result = checkWorkflowDeps("foo.yml", content, tmpDir);

      expect(result.installsDeps).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("passes a workflow that hand-rolls a pnpm install run step", async () => {
      writeScript(tmpDir, "scripts/foo.mjs", 'import { createGhClient } from "@mbe/gh-client";\n');
      const content = [
        "name: Foo",
        "jobs:",
        "  audit:",
        "    steps:",
        "      - uses: actions/checkout@v7.0.1",
        "      - uses: pnpm/action-setup@v5",
        "      - run: pnpm install --frozen-lockfile",
        "      - run: node scripts/foo.mjs",
        "",
      ].join("\n");

      const { checkWorkflowDeps } = await import("../check-workflow-deps.mjs");
      const result = checkWorkflowDeps("foo.yml", content, tmpDir);

      expect(result.installsDeps).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("does not flag a workflow whose script only reaches relative/builtin imports", async () => {
      writeScript(tmpDir, "scripts/foo.mjs", 'import { readFileSync } from "node:fs";\n');
      const content = [
        "name: Foo",
        "jobs:",
        "  audit:",
        "    steps:",
        "      - uses: actions/checkout@v7.0.1",
        "      - uses: actions/setup-node@v7.0.0",
        "      - run: node scripts/foo.mjs",
        "",
      ].join("\n");

      const { checkWorkflowDeps } = await import("../check-workflow-deps.mjs");
      const result = checkWorkflowDeps("foo.yml", content, tmpDir);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("findWorkflowDepsFindings", () => {
    test("collects one finding per offending workflow across the directory", async () => {
      writeScript(tmpDir, "scripts/foo.mjs", 'import { createGhClient } from "@mbe/gh-client";\n');
      writeWorkflow(
        tmpDir,
        "broken.yml",
        [
          "name: Broken",
          "jobs:",
          "  audit:",
          "    steps:",
          "      - uses: actions/setup-node@v7.0.0",
          "      - run: node scripts/foo.mjs",
          "",
        ].join("\n")
      );
      writeWorkflow(
        tmpDir,
        "fine.yml",
        [
          "name: Fine",
          "jobs:",
          "  audit:",
          "    steps:",
          "      - uses: ./.github/actions/setup-workspace",
          "      - run: node scripts/foo.mjs",
          "",
        ].join("\n")
      );

      const { findWorkflowDepsFindings } = await import("../check-workflow-deps.mjs");
      const { findings } = findWorkflowDepsFindings(tmpDir);

      expect(findings).toHaveLength(1);
      expect(findings[0].workflow).toBe("broken.yml");
    });

    test("returns no findings when the workflows directory does not exist", async () => {
      const { findWorkflowDepsFindings } = await import("../check-workflow-deps.mjs");
      const { results, findings } = findWorkflowDepsFindings(path.join(tmpDir, "nope"));

      expect(results).toHaveLength(0);
      expect(findings).toHaveLength(0);
    });
  });

  describe("the real repository — #4225 target workflows", () => {
    // Scoped to the four workflows #4225 fixes, not every workflow in the
    // repo: revert-rca-loop.yml has the same underlying bug (no install
    // step) but is explicitly out of scope for this issue (its status is
    // "unknown" per the issue body, since it's skipped on almost every
    // run) — asserting repo-wide zero findings here would force fixing it
    // as an unrelated drive-by change.
    const TARGET_WORKFLOWS = [
      "resource-audit.yml",
      "auto-issue.yml",
      "chaos-agent.yml",
      "cors-audit.yml",
    ];

    test("each installs dependencies before running its node script", async () => {
      const repoRoot = path.resolve(import.meta.dirname, "..", "..");
      const { findWorkflowDepsFindings } = await import("../check-workflow-deps.mjs");
      const { findings } = findWorkflowDepsFindings(repoRoot);

      const targetFindings = findings.filter((f) => TARGET_WORKFLOWS.includes(f.workflow));

      expect(targetFindings).toEqual([]);
    });
  });

  describe("the real repository — merge-queue-eligibility.mjs comment regression", () => {
    test("does not report the 'never classified at all' JSDoc phrase as a bare specifier", async () => {
      const repoRoot = path.resolve(import.meta.dirname, "..", "..");
      const { collectReachableBareSpecifiers } = await import("../check-workflow-deps.mjs");
      const specifiers = collectReachableBareSpecifiers(
        path.join(repoRoot, "scripts/merge-queue-eligibility.mjs")
      );

      expect([...specifiers]).not.toContain("never classified at all");
    });
  });
});
