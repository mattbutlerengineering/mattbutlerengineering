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
function runClassifier({
  title = "",
  body = "",
  files = [],
  added = 0,
  additions = {},
  isFork = false,
}) {
  const dir = mkdtempSync(join(tmpdir(), "tier-classifier-test-"));
  tmpDirs.push(dir);

  const changedFilesPath = join(dir, "changed-files.txt");
  const outputPath = join(dir, "github-output.txt");
  writeFileSync(changedFilesPath, files.join("\n"));
  // `added` is shorthand: attribute that many lines to the first file.
  const perFile = { ...(added && files[0] ? { [files[0]]: added } : {}), ...additions };
  const numstatPath = join(dir, "numstat.txt");
  writeFileSync(
    numstatPath,
    Object.entries(perFile)
      .map(([path, n]) => `${n}\t0\t${path}`)
      .join("\n")
  );

  const script = extractClassifierScript(WORKFLOW)
    .replace("/tmp/changed-files.txt", changedFilesPath)
    .replace("/tmp/numstat.txt", numstatPath);

  const result = spawnSync(process.execPath, ["-e", script], {
    env: {
      ...process.env,
      PR_TITLE: title,
      PR_BODY: body,
      PR_IS_FORK: String(isFork),
      GITHUB_OUTPUT: outputPath,
    },
    encoding: "utf8",
    cwd: ROOT,
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

  // #5082: the keyword rule used to hard-set T4 regardless of what the PR
  // actually touched — PR #4710 changed exactly one markdown file and was
  // escalated to tier:critical purely because its body discussed "secrets".
  // The rule now only hard-sets T4 when a changed file already matched a
  // T3/T4 sensitive-path rule; otherwise it escalates by at most one tier,
  // same as every other escalation rule in the file.
  it("escalates by at most one tier (not to T4) when a keyword appears but no changed file is sensitive", () => {
    const { tier, label, reasons } = runClassifier({
      title: "fix: rotate leaked Stripe key",
      body: PR_TEMPLATE,
      files: ["docs/onboarding.md"],
    });

    expect(tier).not.toBe(4);
    expect(label).not.toBe("tier:critical");
    expect(reasons).toMatch(/escalate one tier: title\/body mentions secrets or incident/);
  });

  it("still hard-escalates to T4 when the body prose describes a credential leak AND a changed file matched a sensitive path", () => {
    const { tier, label, reasons } = runClassifier({
      title: "fix: redact log field",
      body: `${PR_TEMPLATE}\n\n## Summary\n\nWe discovered a credential was leaked in application logs and this PR redacts it.`,
      files: ["services/users/src/auth/session.ts"],
    });

    expect(tier).toBe(4);
    expect(label).toBe("tier:critical");
    expect(reasons).toMatch(/sensitive path already matched/);
  });

  it("classifies a docs-only PR discussing repo secrets as at most tier:standard, not tier:critical (#5082, #4710)", () => {
    const { tier, label } = runClassifier({
      title: "docs: capture retro item on CI secrets rotation",
      body: `${PR_TEMPLATE}\n\n## Summary\n\nAdd \`TURBO_TOKEN\` + \`TURBO_TEAM\` to repo secrets so remote caching works in CI.`,
      files: ["docs/process-retro.md"],
    });

    expect(tier).toBeLessThanOrEqual(2);
    expect(label).not.toBe("tier:critical");
  });

  it("still classifies a PR touching services/users/src/auth/** as tier:critical with the same secrets-mentioning body (#5082)", () => {
    const { tier, label } = runClassifier({
      title: "fix: harden session cookie handling",
      body: `${PR_TEMPLATE}\n\n## Summary\n\nAdd \`TURBO_TOKEN\` + \`TURBO_TEAM\` to repo secrets so remote caching works in CI.`,
      files: ["services/users/src/auth/session.ts"],
    });

    expect(tier).toBe(4);
    expect(label).toBe("tier:critical");
  });

  it("still classifies a prisma migration PR as tier:critical regardless of body text (#5082)", () => {
    const { tier, label } = runClassifier({
      title: "chore: add index",
      body: `${PR_TEMPLATE}\n\n## Summary\n\nNothing sensitive here, just a routine schema tweak.`,
      files: ["prisma/migrations/20260907_add_index/migration.sql"],
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

describe("tier-classifier keyword rule vs. hyphenated identifiers and code (#5956)", () => {
  const T3_FILES = ["package.json"];
  const body = (prose) => `${PR_TEMPLATE}\n\n## Summary\n\n${prose}`;

  it("does not escalate on a keyword inside a hyphenated script name, #5950's real trigger", () => {
    const { tier, reasons } = runClassifier({
      title: "chore: add check script",
      body: body(
        "> > Note on the baseline: a fresh checkout **without** `pnpm install` reports `prettier`,\n> `boundaries`, and `check-deploy-secret-provisioning` as failing."
      ),
      files: T3_FILES,
    });
    expect(reasons).not.toMatch(/secrets or incident/);
    expect(tier).toBe(3);
  });

  it("does not escalate on the same identifier outside backticks", () => {
    const { tier, reasons } = runClassifier({
      title: "chore: add check script",
      body: body("Also runs check-deploy-secret-provisioning and incident-response-drill."),
      files: T3_FILES,
    });
    expect(reasons).not.toMatch(/secrets or incident/);
    expect(tier).toBe(3);
  });

  it("does not escalate on a keyword inside inline or fenced code", () => {
    const { tier } = runClassifier({
      title: "chore: tweak",
      body: body("Uses `secret` as a variable.\n\n```\nconst credential = 1;\n```"),
      files: T3_FILES,
    });
    expect(tier).toBe(3);
  });

  for (const prose of [
    "rotate the leaked Stripe credential",
    "We rotated the secrets after an incident.",
    "This was a secret-leak, not a drill: the secret is exposed.",
  ]) {
    it(`still escalates to T4 with a T3 path on genuine prose: ${prose}`, () => {
      const { tier, reasons } = runClassifier({
        title: "fix: respond",
        body: body(prose),
        files: T3_FILES,
      });
      expect(reasons).toMatch(/sensitive path already matched/);
      expect(tier).toBe(4);
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

// #5854 review: acmm-regression.yml's daily PR touches only
// .claude/acmm/state.json and apps/marketing/public/acmm-report.json on a
// no-op day, and those two paths matched no rule -- "unmatched paths
// default to T2", which blocks auto-merge on every run (prior
// automation/acmm-regression PRs #5497/#5305/#5056/#4461 all closed
// unmerged). Both are automation-only, non-source output -- the same class
// `metrics/**` already gets T1 for -- so they get the same classification.
describe("tier-classifier path rules: ACMM automation output", () => {
  it("classifies .claude/acmm/state.json alone as tier:trivial", () => {
    const { tier, label } = runClassifier({
      title: "chore(acmm): daily audit 2026-09-29",
      body: PR_TEMPLATE,
      files: [".claude/acmm/state.json"],
    });

    expect(tier).toBe(1);
    expect(label).toBe("tier:trivial");
  });

  it("classifies the state.json + acmm-report.json pair (a real daily-audit diff) as tier:trivial", () => {
    const { tier, label } = runClassifier({
      title: "chore(acmm): daily audit 2026-09-29",
      body: PR_TEMPLATE,
      files: [".claude/acmm/state.json", "apps/marketing/public/acmm-report.json"],
    });

    expect(tier).toBe(1);
    expect(label).toBe("tier:trivial");
  });

  it("classifies apps/marketing/public/acmm-report.json alone as tier:trivial", () => {
    const { tier } = runClassifier({
      title: "chore(acmm): daily audit",
      body: PR_TEMPLATE,
      files: ["apps/marketing/public/acmm-report.json"],
    });
    expect(tier).toBe(1);
  });

  it.each([
    "apps/hospitality/.claude/acmm/state.json",
    "x/.claude/acmm/state.json",
    "apps/marketing/public/acmm-report.json.bak",
  ])("keeps near-miss path %s at tier:standard (exact match, not glob)", (file) => {
    const { tier, label } = runClassifier({
      title: "chore: touch file",
      body: PR_TEMPLATE,
      files: [file],
    });
    expect(tier).toBe(2);
    expect(label).toBe("tier:standard");
  });

  it("does not let a trivial ACMM path launder a non-trivial file in the same PR", () => {
    const { tier } = runClassifier({
      title: "chore(acmm): daily audit",
      body: PR_TEMPLATE,
      files: [".claude/acmm/state.json", "services/users/src/routes/me.ts"],
    });
    expect(tier).toBeGreaterThan(1);
  });

  it("still escalates a trivial ACMM diff over 1000 added lines to tier:standard", () => {
    const { tier } = runClassifier({
      title: "chore(acmm): daily audit",
      body: PR_TEMPLATE,
      files: [".claude/acmm/state.json"],
      added: 1001,
    });
    expect(tier).toBe(2);
  });
});

describe("tier-classifier delegates escalation to scripts/tier-escalation.mjs (#6655)", () => {
  const body = (prose) => `${PR_TEMPLATE}\n\n## Summary\n\n${prose}`;

  it("#6610 shape: generated churn does not push a T3 PR to T4 on size", () => {
    const { tier, reasons } = runClassifier({
      title: "feat: thing",
      body: PR_TEMPLATE,
      files: ["llms-full.txt", "services/a/src/routes/r.ts"],
      additions: { "llms-full.txt": 1194, "services/a/src/routes/r.ts": 988 },
    });
    expect(tier).toBe(3);
    expect(reasons).not.toMatch(/lines added/);
  });

  it("#6591 shape: >1000 real code lines still escalates one tier", () => {
    const { tier, reasons } = runClassifier({
      title: "feat: thing",
      body: PR_TEMPLATE,
      files: ["services/a/src/routes/r.ts", "docs/guide.md"],
      additions: { "services/a/src/routes/r.ts": 1387, "docs/guide.md": 943 },
    });
    expect(tier).toBe(4);
    expect(reasons).toMatch(/review-surface lines added/);
  });

  it("#6541 shape: a descriptive credentials mention does not escalate", () => {
    const { tier, reasons } = runClassifier({
      title: "chore: add e2e spec",
      body: body("Needs a human to supply the E2E_AUTH0_USER credentials or CI/artifact access."),
      files: ["services/a/src/x.ts"],
    });
    expect(tier).toBe(2);
    expect(reasons).not.toMatch(/secrets or incident/);
  });

  it("a real incident sentence still escalates a non-sensitive PR one tier", () => {
    const { tier, reasons } = runClassifier({
      title: "chore: cleanup",
      body: body("We leaked the Stripe key and must rotate it."),
      files: ["services/a/src/x.ts"],
    });
    expect(tier).toBe(3);
    expect(reasons).toMatch(/secrets or incident/);
  });

  it("a real incident with a sensitive path still lands T4", () => {
    const { tier } = runClassifier({
      title: "fix: redact",
      body: body("We leaked the Stripe key and must rotate it."),
      files: ["services/users/src/auth/session.ts"],
    });
    expect(tier).toBe(4);
  });

  it("a secret/credential file edit under an infra path stays T4", () => {
    const { tier } = runClassifier({
      title: "chore: rotate the production secret",
      body: PR_TEMPLATE,
      files: ["infrastructure/pulumi/Pulumi.prod.yaml"],
    });
    expect(tier).toBe(4);
  });

  it("the workflow loads the module instead of inlining the policy", () => {
    const script = extractClassifierScript(WORKFLOW);
    expect(script).toMatch(/tier-escalation\.mjs/);
    expect(script).not.toMatch(/added > 1000/);
  });

  it("fails closed (non-zero exit, no tier output) if the module cannot load", () => {
    const dir = mkdtempSync(join(tmpdir(), "tier-classifier-missing-"));
    tmpDirs.push(dir);
    writeFileSync(join(dir, "changed.txt"), "a.ts");
    const outputPath = join(dir, "out.txt");
    const script = extractClassifierScript(WORKFLOW).replace(
      "/tmp/changed-files.txt",
      join(dir, "changed.txt")
    );
    const result = spawnSync(process.execPath, ["-e", script], {
      env: { ...process.env, GITHUB_OUTPUT: outputPath },
      encoding: "utf8",
      cwd: dir,
    });
    expect(result.status).not.toBe(0);
  });
});
