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

  // #4879 is a 19-line docs-only PR that got escalated to T4 because its body
  // said "returned one incidental hit" — /secret|credential|rotate|leak|incident/i
  // has no word boundaries, so "incidental" substring-matches "incident". This
  // is a different mechanism than #3606 (checklist-line stripping): the false
  // positive here comes from prose the stripper legitimately keeps.
  const SUBSTRING_FALSE_POSITIVES = [
    ["incidental", "returned one incidental hit, inside an unrelated table cell"],
    ["coincidentally", "coincidentally the same value appears twice in the fixture"],
    ["leaky", "this refactor removes a leaky abstraction from the client"],
    ["rotated baseline", "the rotated baseline was regenerated after the CSS change"],
  ];

  for (const [name, prose] of SUBSTRING_FALSE_POSITIVES) {
    it(`does not escalate to T4 on the "${name}" substring false positive (#4879)`, () => {
      const { tier, reasons } = runClassifier({
        title: "docs: fix typo in onboarding guide",
        body: `${PR_TEMPLATE}\n\n## Summary\n\n${prose}`,
        files: ["docs/onboarding.md"],
      });

      expect(reasons).not.toMatch(/secrets or incident/);
      expect(tier).not.toBe(4);
    });
  }
});

describe("tier-classifier bypass rule: a request escalates, a description does not", () => {
  // docs/change-tiers.md: "PR body explicitly asks reviewers to bypass a
  // check." The pre-#4279 pattern was /bypass.*check|skip.*review/i against
  // the RAW body, which matched any mention. Replayed over the 300 most
  // recent PR bodies it escalated 9, every one of them descriptive prose;
  // #3919 is the one that manufactured issue #3921 for a human to close.

  const DESCRIBES_A_BYPASS = [
    // Verbatim from PR #3919 — the observed false positive behind #3921.
    '`AGENTS.md`\'s "Skip in Emergencies" section documents `SKIP=semgrep git commit -m "..."` as a way to bypass the Semgrep pre-commit check. This doesn\'t work.',
    // Verbatim from PR #3922.
    "text skips review on a PR the code says isn't low-risk (an unreviewed",
    // Verbatim from PR #4007.
    '`reviewer_verdict: "skipped"` on the two docs PRs records the low-risk fast path, not a fail-open.',
    // Verbatim from PR #3943.
    "One ratchet needed an explicit, sanctioned baseline update (not a bypass): the `hardcodedRoutes` AI-antipattern counter went 603→607.",
    // The shape this very PR's own description takes.
    "The gate can be bypassed by a check that never runs, which is the bug this fixes.",
  ];

  for (const [i, prose] of DESCRIBES_A_BYPASS.entries()) {
    it(`does not escalate on prose that only describes a bypass (${i + 1})`, () => {
      const { tier, reasons } = runClassifier({
        title: "docs: correct the emergency-skip instructions",
        body: `${PR_TEMPLATE}\n\n## Summary\n\n${prose}`,
        files: ["docs/onboarding.md"],
      });

      expect(reasons).not.toMatch(/bypass a check/);
      expect(tier).not.toBe(4);
    });
  }

  const ASKS_FOR_A_BYPASS = [
    "Please bypass the CI check on this one, the runner is wedged.",
    "Can you skip the review gate for this hotfix?",
    "I need to skip the lint check because the rule is broken upstream.",
    "Bypass the coverage gate and merge.",
    "We want to merge without review here since main is red.",
    "Requesting approval without CI: the deploy is blocked.",
  ];

  for (const [i, ask] of ASKS_FOR_A_BYPASS.entries()) {
    it(`escalates to T4 on an actual request to bypass (${i + 1})`, () => {
      const { tier, label, reasons } = runClassifier({
        title: "fix: correct the retry backoff",
        body: `${PR_TEMPLATE}\n\n## Summary\n\n${ask}`,
        files: ["docs/onboarding.md"],
      });

      expect(tier).toBe(4);
      expect(label).toBe("tier:critical");
      expect(reasons).toMatch(/bypass a check/);
    });
  }

  it("reads the boilerplate-stripped prose, so a template checklist line cannot escalate", () => {
    // The secrets rule got this stripping in #3606; the bypass rule did not,
    // which left a live trap: the day PULL_REQUEST_TEMPLATE.md gains a
    // checklist line worded like a bypass request, EVERY template-filled PR
    // escalates to T4 — exactly the #3606 outage, one keyword over.
    const { tier, reasons } = runClassifier({
      title: "docs: fix typo in onboarding guide",
      body: `${PR_TEMPLATE}\n- [x] I request permission to skip the review gate\n`,
      files: ["docs/onboarding.md"],
    });

    expect(reasons).not.toMatch(/bypass a check/);
    expect(tier).not.toBe(4);
  });
});
