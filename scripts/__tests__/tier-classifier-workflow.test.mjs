import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/tier-classifier.yml"), "utf8");
const PR_TEMPLATE = readFileSync(resolve(ROOT, ".github/PULL_REQUEST_TEMPLATE.md"), "utf8");

/**
 * Pull the `node - <<'NODE' ... NODE` heredoc body out of the workflow's
 * Classify step.
 *
 * Parsed textually rather than with a YAML library, matching the precedent
 * in drift-fix-workflow.test.mjs / ci-node-matrix.test.mjs: nothing in
 * `scripts/` depends on a YAML parser, and the heredoc is a plain literal
 * block with a stable start/end marker.
 */
function extractClassifierScript(source) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.includes("node - <<'NODE'"));
  if (start === -1) throw new Error("tier-classifier.yml has no `node - <<'NODE'` block");
  const end = lines.findIndex((l, i) => i > start && l.trim() === "NODE");
  if (end === -1) throw new Error("tier-classifier.yml `NODE` heredoc has no closing marker");
  return lines.slice(start + 1, end).join("\n");
}

const tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Execute the real classifier script (extracted from the workflow file) in a
 * child Node process, wired up the same way the Classify step wires it: a
 * changed-files list on disk, PR_TITLE / PR_BODY / ADDED_LINES / PR_IS_FORK
 * env vars, and a GITHUB_OUTPUT file to capture `tier=` / `label=` / `reasons=`.
 *
 * The script's own `/tmp/changed-files.txt` literal is substituted for a
 * per-test temp path so parallel test runs cannot collide — this is the only
 * deviation from the committed script text.
 */
function runClassifier({ title = "", body = "", files = [], added = 0, isFork = false }) {
  const dir = mkdtempSync(join(tmpdir(), "tier-classifier-test-"));
  tmpDirs.push(dir);

  const changedFilesPath = join(dir, "changed-files.txt");
  const outputPath = join(dir, "github-output.txt");
  writeFileSync(changedFilesPath, files.join("\n"));

  const script = extractClassifierScript(WORKFLOW).replace(
    "/tmp/changed-files.txt",
    changedFilesPath
  );

  const result = spawnSync(process.execPath, ["-e", script], {
    env: {
      ...process.env,
      PR_TITLE: title,
      PR_BODY: body,
      ADDED_LINES: String(added),
      PR_IS_FORK: String(isFork),
      GITHUB_OUTPUT: outputPath,
    },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`classifier script exited ${result.status}: ${result.stderr}`);
  }

  const output = readFileSync(outputPath, "utf8");
  const tier = Number(output.match(/^tier=(\d+)$/m)?.[1]);
  const label = output.match(/^label=(.+)$/m)?.[1];
  const reasons = output.match(/^reasons=(.*)$/m)?.[1] ?? "";
  return { tier, label, reasons };
}

describe("tier-classifier keyword escalation vs. the PR template", () => {
  it("does not escalate to T4 when the body is the unmodified PR template", () => {
    // .github/PULL_REQUEST_TEMPLATE.md's own checklist contains the line
    // "- [ ] **No hardcoded secrets or credentials**", which matches
    // /secret|credential/i twice. Filling in the template (with no other
    // secret-related content) must not, by itself, trigger the T4 escalation.
    const { tier, label } = runClassifier({
      title: "docs: fix typo in onboarding guide",
      body: PR_TEMPLATE,
      files: ["docs/onboarding.md"],
    });

    expect(tier).not.toBe(4);
    expect(label).not.toBe("tier:critical");
  });

  it("still escalates to T4 when the title genuinely mentions secrets", () => {
    const { tier, label, reasons } = runClassifier({
      title: "fix: rotate leaked Stripe key",
      body: PR_TEMPLATE,
      files: ["docs/onboarding.md"],
    });

    expect(tier).toBe(4);
    expect(label).toBe("tier:critical");
    expect(reasons).toMatch(/secrets or incident/);
  });

  it("still escalates to T4 when the body prose describes a credential leak", () => {
    const { tier, label } = runClassifier({
      title: "fix: redact log field",
      body: `${PR_TEMPLATE}\n\n## Summary\n\nWe discovered a credential was leaked in application logs and this PR redacts it.`,
      files: ["services/users/src/logger.ts"],
    });

    expect(tier).toBe(4);
    expect(label).toBe("tier:critical");
  });
});
