import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function writeFile(root, relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const RAW_WORKFLOW = `name: Example
jobs:
  file-issue:
    steps:
      - run: |
          URL=$(gh issue create --title "t" --body "b")
`;

const RAW_JS_PRODUCER = `import { createGhClient } from "@mbe/gh-client";

export function fileIt(title, body) {
  const ghClient = createGhClient();
  return ghClient.issue.create(["--title", title, "--body", body]);
}
`;

const COMPLIANT_JS_PRODUCER = `import { createGhClient } from "@mbe/gh-client";
import { fileIssue } from "./lib/issue-filing.mjs";

export function fileIt(title, body, ledger) {
  const ghClient = createGhClient();
  return fileIssue({ title, body, labels: [], dedupeKey: title }, ledger, {
    getIssueState: () => "missing",
    createIssue: () => ghClient.issue.create(["--title", title, "--body", body]),
    reopenIssue: () => {},
  });
}
`;

describe("check-issue-filing-seam", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-filing-seam-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("scanContentForBypass", () => {
    test("flags a raw `gh issue create` shell invocation in workflow YAML", async () => {
      const { scanContentForBypass } = await import("../check-issue-filing-seam.mjs");
      const findings = scanContentForBypass(".github/workflows/example.yml", RAW_WORKFLOW);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        file: ".github/workflows/example.yml",
        line: 6,
        pattern: "gh issue create",
      });
    });

    test("flags a raw `.issue.create(` call in a JS producer that never calls fileIssue()", async () => {
      const { scanContentForBypass } = await import("../check-issue-filing-seam.mjs");
      const findings = scanContentForBypass("scripts/new-producer.mjs", RAW_JS_PRODUCER);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        file: "scripts/new-producer.mjs",
        pattern: ".issue.create(",
      });
    });

    test("does not flag scripts/lib/issue-filing.mjs — the named module exception", async () => {
      const { scanContentForBypass } = await import("../check-issue-filing-seam.mjs");
      // Fabricated content that WOULD match the raw pattern, to prove this is an
      // explicit, named exception and not a coincidental pass because the real
      // file happens not to contain the string.
      const findings = scanContentForBypass(
        "scripts/lib/issue-filing.mjs",
        "ghClient.issue.create(args);"
      );

      expect(findings).toEqual([]);
    });

    test("does not flag test fixtures that reference the pattern as string data", async () => {
      const { scanContentForBypass } = await import("../check-issue-filing-seam.mjs");
      const findings = scanContentForBypass(
        "scripts/__tests__/some-producer.test.mjs",
        'expect(cmd).toContain("gh issue create");\nghClient.issue.create(["--title", "x"]);'
      );

      expect(findings).toEqual([]);
    });

    test("ignores a `gh issue create` reference inside a comment line", async () => {
      const { scanContentForBypass } = await import("../check-issue-filing-seam.mjs");
      const findings = scanContentForBypass(
        "scripts/audit/example.sh",
        '#!/usr/bin/env bash\n# see: gh issue create --help\necho "not a real call"\n'
      );

      expect(findings).toEqual([]);
    });

    test("does not flag a JS producer whose `.issue.create(` call is fileIssue()'s deps.createIssue callback", async () => {
      const { scanContentForBypass } = await import("../check-issue-filing-seam.mjs");
      const findings = scanContentForBypass(
        "scripts/compliant-producer.mjs",
        COMPLIANT_JS_PRODUCER
      );

      expect(findings).toEqual([]);
    });
  });

  describe("findIssueFilingBypassFindings", () => {
    test("passes (zero findings) on a clean tree", async () => {
      writeFile(
        tmpDir,
        ".github/workflows/example.yml",
        "name: Example\njobs:\n  build:\n    steps: []\n"
      );
      writeFile(tmpDir, "scripts/compliant-producer.mjs", COMPLIANT_JS_PRODUCER);
      writeFile(tmpDir, "scripts/lib/issue-filing.mjs", "export function fileIssue() {}\n");

      const { findIssueFilingBypassFindings } = await import("../check-issue-filing-seam.mjs");
      const { findings } = findIssueFilingBypassFindings(tmpDir);

      expect(findings).toEqual([]);
    });

    test("fails (non-zero findings) when a planted violation bypasses the module", async () => {
      writeFile(
        tmpDir,
        ".github/workflows/example.yml",
        "name: Example\njobs:\n  build:\n    steps: []\n"
      );
      writeFile(tmpDir, "scripts/new-producer.mjs", RAW_JS_PRODUCER);

      const { findIssueFilingBypassFindings } = await import("../check-issue-filing-seam.mjs");
      const { findings } = findIssueFilingBypassFindings(tmpDir);

      expect(findings).toHaveLength(1);
      expect(findings[0].file).toBe("scripts/new-producer.mjs");
    });

    test("a planted violation in workflow YAML is also caught", async () => {
      writeFile(tmpDir, ".github/workflows/rogue.yml", RAW_WORKFLOW);

      const { findIssueFilingBypassFindings } = await import("../check-issue-filing-seam.mjs");
      const { findings } = findIssueFilingBypassFindings(tmpDir);

      expect(findings).toHaveLength(1);
      expect(findings[0].file).toBe(".github/workflows/rogue.yml");
    });
  });

  describe("the real repository", () => {
    test("has zero unexempted raw issue-creation call sites", async () => {
      const repoRoot = path.resolve(import.meta.dirname, "..", "..");
      const { findIssueFilingBypassFindings } = await import("../check-issue-filing-seam.mjs");
      const { findings } = findIssueFilingBypassFindings(repoRoot);

      expect(findings.map((f) => `${f.file}:${f.line}`)).toEqual([]);
    });
  });

  describe("formatFinding output", () => {
    test("names the offending file:line and points at fileIssue()", async () => {
      const { formatFinding } = await import("../check-issue-filing-seam.mjs");
      const message = formatFinding({
        file: "scripts/new-producer.mjs",
        line: 5,
        pattern: ".issue.create(",
        snippet: "ghClient.issue.create(args);",
      });

      expect(message).toContain("scripts/new-producer.mjs:5");
      expect(message).toContain("fileIssue()");
      expect(message).toContain("scripts/lib/issue-filing.mjs");
    });
  });
});
