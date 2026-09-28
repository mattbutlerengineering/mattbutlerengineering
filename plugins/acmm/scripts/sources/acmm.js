/**
 * Check functions for `acmm` criteria whose detection can't be expressed as a
 * plain path/any-of/grep/active pattern — a composite condition (grep AND a
 * recent workflow run), a count threshold, or a live `gh` query.
 *
 * Routed via `detection.type: "check"` (see detection.js / evaluate.js):
 * `criterion.check(cwd, opts)` runs unconditionally and its `{ passed, evidence }`
 * result IS the verdict — `passed: null` means unverifiable (e.g. `gh` unavailable),
 * never a silent pass.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync as _execFileSync } from "node:child_process";
import { isWorkflowActive } from "../detection.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Shared check for a ci.yml step that both (a) exists as literal step text and
 * (b) has produced a recent successful run on main. Fixes the "any ci.yml
 * success counts" false-positive shared by instruction-sync-gate and
 * instruction-rot-detection before #5851 — `active` alone can't tell whether
 * the specific step exists at all, only whether *some* job in the workflow
 * file succeeded recently.
 */
function checkCiStepActive(cwd, opts, { stepText, maxAgeDays }) {
  const ciRelPath = ".github/workflows/ci.yml";
  const ciPath = join(cwd, ciRelPath);
  if (!existsSync(ciPath)) {
    return { passed: false, evidence: `${ciRelPath} not found` };
  }
  let content;
  try {
    content = readFileSync(ciPath, "utf-8");
  } catch {
    return { passed: false, evidence: `${ciRelPath} unreadable` };
  }
  if (!content.includes(stepText)) {
    return { passed: false, evidence: `${ciRelPath} does not contain "${stepText}"` };
  }
  const result = isWorkflowActive(cwd, ciRelPath, maxAgeDays, opts);
  if (result.degraded) {
    return { passed: null, evidence: result.reason };
  }
  if (!result.active) {
    return { passed: false, evidence: `${ciRelPath} contains "${stepText}" but ${result.reason}` };
  }
  return { passed: true, evidence: `${ciRelPath} contains "${stepText}" and ${result.reason}` };
}

/** acmm:instruction-sync-gate — real step is `pnpm regen --check` (ci.yml). */
export function checkInstructionSyncGate(cwd, opts = {}) {
  return checkCiStepActive(cwd, opts, { stepText: "pnpm regen --check", maxAgeDays: 7 });
}

/** acmm:instruction-rot-detection — real step runs detect-instruction-rot.mjs. */
export function checkInstructionRotDetection(cwd, opts = {}) {
  return checkCiStepActive(cwd, opts, { stepText: "detect-instruction-rot.mjs", maxAgeDays: 7 });
}

/**
 * acmm:multi-perspective-review — real evidence is dedicated reviewer
 * subagents (`.claude/agents/*reviewer*.md`), not `.claude/skills/` existence
 * (which four other now-merged criteria already covered under different names).
 */
export function checkMultiPerspectiveReview(cwd, _opts = {}) {
  const dir = join(cwd, ".claude", "agents");
  if (!existsSync(dir)) {
    return { passed: false, evidence: ".claude/agents/ not found" };
  }
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return { passed: false, evidence: ".claude/agents/ unreadable" };
  }
  const reviewers = entries.filter(
    (f) => f.toLowerCase().includes("reviewer") && f.endsWith(".md")
  );
  if (reviewers.length < 2) {
    return {
      passed: false,
      evidence: `only ${reviewers.length} .claude/agents/*reviewer*.md file(s) — need ≥2`,
    };
  }
  return { passed: true, evidence: `${reviewers.length} dedicated reviewer subagents found` };
}

/**
 * acmm:evidence-antipatterns — real evidence is that gotchas.md's antipattern
 * list actually cites real issue/PR numbers as evidence, not just that
 * CLAUDE.md exists (which every criterion routed through `path: "CLAUDE.md"`
 * passed identically, telling apart nothing).
 */
const EVIDENCE_CITATION_THRESHOLD = 15;

export function checkEvidenceAntipatterns(cwd, _opts = {}) {
  const gotchasPath = join(cwd, ".claude", "rules", "gotchas.md");
  if (!existsSync(gotchasPath)) {
    return { passed: false, evidence: ".claude/rules/gotchas.md not found" };
  }
  let content;
  try {
    content = readFileSync(gotchasPath, "utf-8");
  } catch {
    return { passed: false, evidence: ".claude/rules/gotchas.md unreadable" };
  }
  const citations = new Set((content.match(/#\d{3,6}\b/g) ?? []).map((m) => m));
  if (citations.size < EVIDENCE_CITATION_THRESHOLD) {
    return {
      passed: false,
      evidence: `only ${citations.size} distinct issue/PR citations in gotchas.md — need ≥${EVIDENCE_CITATION_THRESHOLD}`,
    };
  }
  return {
    passed: true,
    evidence: `${citations.size} distinct issue/PR citations found in gotchas.md`,
  };
}

/**
 * acmm:auto-issue-gen — retargeted by the #5853 amendment away from
 * auto-issue.yml (this scanner's own workflow, satisfying its own criterion
 * regardless of whether it ever filed anything). Real evidence: automation
 * actually filed issues — ≥1 in the last 30 days carrying one of the
 * automation labels sentry/audit/ci-fix.
 */
const AUTOMATION_ISSUE_LABELS = ["sentry", "audit", "ci-fix"];

export function checkAutoIssueGen(cwd, opts = {}) {
  const fn = opts.execFileSyncFn ?? _execFileSync;
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const recentNumbers = new Set();
  const failedLabels = [];

  for (const label of AUTOMATION_ISSUE_LABELS) {
    try {
      const raw = fn(
        "gh",
        [
          "issue",
          "list",
          "--label",
          label,
          "--state",
          "all",
          "--json",
          "number,createdAt",
          "--limit",
          "100",
        ],
        { cwd, encoding: "utf-8", timeout: 15_000, stdio: ["pipe", "pipe", "pipe"] }
      );
      const items = JSON.parse(raw);
      for (const item of items) {
        if (item.createdAt && new Date(item.createdAt).getTime() >= cutoff) {
          recentNumbers.add(item.number);
        }
      }
    } catch {
      // this label's query failed (or `gh` errored entirely) — record it and
      // keep trying the remaining labels rather than aborting the whole check.
      failedLabels.push(label);
    }
  }

  if (failedLabels.length === AUTOMATION_ISSUE_LABELS.length) {
    return {
      passed: null,
      evidence: "gh CLI unavailable or error querying sentry/audit/ci-fix issues",
    };
  }
  if (recentNumbers.size === 0) {
    return {
      passed: false,
      evidence: "no sentry/audit/ci-fix-labeled issue created in the last 30 days",
    };
  }
  return {
    passed: true,
    evidence: `${recentNumbers.size} automation-labeled issue(s) created in the last 30 days`,
  };
}

const LEVELS = [
  {
    n: 0,
    name: "Prerequisites",
    role: "",
    characteristic:
      "Standard engineering practices the maturity levels build on. Not AI-specific, but required for the framework to function.",
    transitionTrigger:
      '"I have basic engineering hygiene in place and want to start using AI effectively."',
    antiPattern:
      "Skipping fundamentals: trying to adopt AI workflows without a test suite, CI, or contribution process.",
  },
  {
    n: 1,
    name: "Assisted / Ad Hoc",
    role: "Executor",
    characteristic:
      "AI used opportunistically with no project-specific configuration. Each session starts from scratch with no shared context.",
    transitionTrigger: '"I keep repeating the same corrections to the AI."',
    antiPattern:
      "Tool-chasing: adopting every new model or IDE plugin in search of productivity that only comes from encoding judgment.",
  },
  {
    n: 2,
    name: "Instructed",
    role: "Rule-writer",
    characteristic:
      "AI receives project context through committed files. Every session starts with the same conventions and expectations.",
    transitionTrigger: '"I want the rules enforced mechanically, not just written down."',
    antiPattern:
      "Instruction rot: letting CLAUDE.md drift out of sync with the code so the rules stop matching reality.",
  },
  {
    n: 3,
    name: "Measured / Enforced",
    role: "Analyst",
    characteristic:
      "Rules mechanically enforced via hooks, CI, and permission gates. The team instruments the AI loop with acceptance rate, coverage, and review density.",
    transitionTrigger: '"I want the system to tune itself from the metrics."',
    antiPattern:
      "Dashboard graveyard: building measurement no one acts on. A metric that does not change a workflow is overhead, not maturity.",
  },
  {
    n: 4,
    name: "Adaptive / Structured",
    role: "Governor",
    characteristic:
      "Workflows are structured and environment-aware. The AI follows decision trees, not improvisation. Metrics feed back into instructions and gating thresholds.",
    transitionTrigger: '"I want the system to decide what work to do next."',
    antiPattern:
      "Policy theater: auto-tuning thresholds without a human-readable explanation of why they changed.",
  },
  {
    n: 5,
    name: "Semi-Automated",
    role: "Operator",
    characteristic:
      "The system detects problems and proposes fixes without human initiation. Humans still approve; the system proposes.",
    transitionTrigger: '"I want the system to act on what it finds, not just propose."',
    antiPattern:
      "Alert fatigue: generating proposals no one reviews. An unread suggestion is noise, not maturity.",
  },
  {
    n: 6,
    name: "Fully Autonomous",
    role: "Strategist",
    characteristic:
      "The system acts on what it finds — generates issues, merges PRs, rolls back failures. Humans set policy and audit after the fact.",
    transitionTrigger:
      "None — L6 is the terminal state. The human role becomes direction-setting, not code writing.",
    antiPattern:
      "Mistaking autonomy for abandonment: an autonomous codebase still needs a strategist to set direction, or it drifts toward local optima.",
  },
];

const CRITERIA = [
  // ── L0 — Prerequisites ──────────────────────────────────────────
  {
    id: "acmm:prereq-test-suite",
    source: "acmm",
    level: 0,
    category: "prerequisite",
    name: "Automated test suite",
    description: "A test runner config and at least one test directory.",
    rationale:
      "Without tests, TDD workflows, coverage gates, and verify-before-reporting have nothing to run.",
    details:
      "An automated test suite is a test framework (Vitest, Jest, pytest, go test, etc.) with a configuration file and at least one test directory. It is the foundation for all measurement — you cannot gate on coverage, track regressions, or validate AI changes without runnable tests. An AI mission will detect your language/framework, add the appropriate test runner config, and create an example test file.",
    detection: {
      type: "any-of",
      pattern: [
        "vitest.config.ts",
        "vitest.config.js",
        "jest.config.js",
        "jest.config.ts",
        "go.mod",
        "pytest.ini",
        "pyproject.toml",
      ],
    },
  },
  {
    id: "acmm:prereq-e2e",
    source: "acmm",
    level: 0,
    category: "prerequisite",
    name: "End-to-end tests",
    description:
      "Playwright, Cypress, or equivalent E2E test suite that verifies the system works as a whole.",
    rationale:
      "Unit tests catch code-level bugs but miss integration failures that only appear when components connect.",
    details:
      "End-to-end tests use tools like Playwright or Cypress to simulate real user interactions and verify the entire stack works together. An AI mission will add a Playwright or Cypress config and create smoke tests for your application's critical user paths.",
    detection: {
      type: "any-of",
      pattern: [
        "playwright.config.ts",
        "playwright.config.js",
        "cypress.config.ts",
        "cypress.config.js",
        "e2e/",
        "tests/e2e/",
        // Monorepo layouts keep E2E configs per-app, not at the root — without
        // these literals a fresh checkout scores not-found (regressed L6→L5).
        "tests/smoke/playwright.config.ts",
        "apps/hospitality/playwright.config.ts",
        "apps/gen/playwright.config.ts",
        "apps/marketing/playwright.config.ts",
        "apps/rialto-web/playwright.config.ts",
      ],
    },
  },
  {
    id: "acmm:prereq-cicd",
    source: "acmm",
    level: 0,
    category: "prerequisite",
    name: "CI/CD pipeline",
    description: "A working CI/CD pipeline that runs on every PR.",
    rationale: "The foundation for coverage gates, nightly scans, and automated review workflows.",
    details:
      "A CI/CD pipeline runs build, test, and lint on every push and PR. Without it, AI-generated changes ship untested. An AI mission will add a GitHub Actions workflow covering your project's build and test commands.",
    detection: {
      type: "any-of",
      pattern: [".github/workflows/", ".gitlab-ci.yml", "Jenkinsfile", ".circleci/"],
    },
  },
  {
    id: "acmm:prereq-pr-template",
    source: "acmm",
    level: 0,
    category: "prerequisite",
    name: "Pull request template",
    description:
      "Structured PR description template that guides both humans and AI when creating or reviewing PRs.",
    rationale:
      "A template nudges every PR through the same reasoning — a structural aid for consistent contributions.",
    details:
      "A PR template is a markdown form that pre-populates every new pull request with sections like Summary, Test Plan, and Breaking Changes. An AI mission will create a PR template tailored to your project's review workflow.",
    detection: {
      type: "any-of",
      pattern: [".github/pull_request_template.md", ".github/PULL_REQUEST_TEMPLATE.md"],
    },
    referencePath: ".github/pull_request_template.md",
  },
  {
    id: "acmm:prereq-issue-template",
    source: "acmm",
    level: 0,
    category: "prerequisite",
    name: "Issue template",
    description: "Structured issue form that ensures every report is triageable by humans and AI.",
    rationale: "Forces consistent issue shape so automation can classify and triage.",
    details:
      "Issue templates are structured forms (bug report, feature request, etc.) that ensure every new issue includes the fields needed for triage. An AI mission will create issue templates based on your project's common issue categories.",
    detection: {
      type: "any-of",
      pattern: [".github/ISSUE_TEMPLATE/", ".github/issue_template.md"],
    },
  },
  {
    id: "acmm:prereq-contrib-guide",
    source: "acmm",
    level: 0,
    category: "prerequisite",
    name: "Contributing guide",
    description:
      "CONTRIBUTING.md used both by humans and AI to understand contribution rules, development setup, and workflow expectations.",
    rationale: "Documented process is a signal the team has articulated how work enters the repo.",
    details:
      "CONTRIBUTING.md documents how to set up the development environment, run tests, format code, and submit changes. An AI mission will generate a contributing guide from your existing setup scripts, CI config, and code style rules.",
    detection: { type: "any-of", pattern: ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"] },
  },
  {
    id: "acmm:prereq-code-style",
    source: "acmm",
    level: 0,
    category: "prerequisite",
    name: "Code style config",
    description:
      "Committed formatter and linter configuration that enforces style mechanically rather than through instructions.",
    rationale: "Style rules expressed as config — mechanized judgment.",
    details:
      "A code style config file (like .eslintrc, .prettierrc, or .golangci.yml) enforces formatting and linting rules automatically. An AI mission will detect your language stack and create the appropriate linter/formatter config.",
    detection: {
      type: "any-of",
      pattern: [
        ".eslintrc",
        ".eslintrc.json",
        ".eslintrc.js",
        "eslint.config.js",
        ".prettierrc",
        "ruff.toml",
        ".golangci.yml",
      ],
    },
  },
  {
    id: "acmm:prereq-coverage-gate",
    source: "acmm",
    level: 0,
    category: "prerequisite",
    name: "Coverage gate workflow",
    description: "CI workflow that fails PRs below a coverage threshold.",
    rationale: "The first metric you encode as a blocking signal.",
    details:
      "A coverage gate is a CI workflow that blocks merging when test coverage drops below a threshold (e.g., 80%). It turns test coverage from a number you glance at into a hard constraint that both humans and AI must satisfy. An AI mission will add a GitHub Actions workflow that runs your test suite with coverage reporting and fails the PR check if coverage regresses.",
    detection: {
      type: "any-of",
      pattern: [
        ".github/workflows/coverage-gate.yml",
        ".github/workflows/coverage.yml",
        ".coverage-thresholds.json",
      ],
    },
    referencePath: ".github/workflows/coverage-gate.yml",
  },

  // ── L2 — Instructed ─────────────────────────────────────────────
  {
    id: "acmm:claude-md",
    source: "acmm",
    level: 2,
    category: "feedback-loop",
    name: "CLAUDE.md instructions",
    description: "Project-level instructions loaded by Claude Code at every session start.",
    rationale:
      "The foundational L2 feedback loop: encoding judgment as text the AI reads every session.",
    details:
      "CLAUDE.md is a file at the root of your repository that Claude Code reads automatically at the start of every session. It tells the AI about your project conventions, forbidden patterns, preferred libraries, and workflow rules so you do not have to repeat yourself. An AI mission will audit your repo for existing conventions and generate a CLAUDE.md that captures them, so every future AI session starts with the right context.",
    detection: { type: "path", pattern: "CLAUDE.md" },
    referencePath: "CLAUDE.md",
    frequency: "Every AI session",
  },
  {
    id: "acmm:copilot-instructions",
    source: "acmm",
    level: 2,
    category: "feedback-loop",
    name: "Copilot instructions",
    description: "GitHub Copilot repository instructions loaded on every Copilot interaction.",
    rationale: "Same L2 signal as CLAUDE.md, scoped to Copilot users.",
    details:
      "copilot-instructions.md is a file in .github/ that GitHub Copilot reads to understand your project-specific rules during every interaction. An AI mission will create this file from your existing code conventions so Copilot suggestions match your team standards out of the box.",
    detection: { type: "path", pattern: ".github/copilot-instructions.md" },
    referencePath: ".github/copilot-instructions.md",
    frequency: "Every Copilot session",
  },
  {
    id: "acmm:agents-md",
    source: "acmm",
    level: 2,
    category: "feedback-loop",
    name: "AGENTS.md shared directives",
    description: "Cross-tool agent instructions readable by any AI coding tool.",
    rationale: "Portable instructions that survive tool changes — an L2 durability signal.",
    details:
      "AGENTS.md is a tool-agnostic instruction file that any AI coding agent can read. It ensures your project rules survive tool switches without having to rewrite instructions for each platform.",
    detection: { type: "path", pattern: "AGENTS.md" },
    frequency: "Every AI session",
  },
  {
    id: "acmm:cursor-rules",
    source: "acmm",
    level: 2,
    category: "feedback-loop",
    name: "Cursor rules",
    description: "Cursor IDE project rules that guide its agent.",
    rationale: "Tool-specific L2 signal for Cursor users.",
    details:
      "Cursor rules are project-level instruction files that the Cursor IDE reads to guide its AI agent during code generation and editing.",
    detection: { type: "any-of", pattern: [".cursor/rules", ".cursorrules"] },
    frequency: "Every Cursor session",
  },
  {
    id: "acmm:prompts-catalog",
    source: "acmm",
    level: 2,
    category: "feedback-loop",
    name: "Prompt catalog",
    description: "Committed prompt templates for recurring tasks.",
    rationale: "Reusing prompts across the team turns tribal knowledge into shared L2 assets.",
    details:
      "A prompt catalog is a directory of reusable prompt templates that encode your team's best approaches to recurring tasks.",
    detection: {
      type: "any-of",
      pattern: ["prompts/", ".prompts/", "docs/prompts/", ".github/prompts/", ".github/agents/"],
    },
  },
  {
    id: "acmm:editor-config",
    source: "acmm",
    level: 2,
    category: "feedback-loop",
    name: "EditorConfig",
    description: ".editorconfig for cross-editor consistency.",
    rationale: "Baseline L2 consistency signal — trivial to add, hard to retrofit.",
    details:
      "EditorConfig is a simple dotfile (.editorconfig) that tells every editor and IDE to use the same indentation, line endings, and charset settings.",
    detection: { type: "path", pattern: ".editorconfig" },
  },
  {
    id: "acmm:simple-skills",
    source: "acmm",
    level: 2,
    category: "feedback-loop",
    name: "Simple skills",
    description:
      "Skills that capture common patterns as checklists, reference lookups, or common task sequences.",
    rationale:
      "Lightweight skills document how to do recurring tasks rather than encoding complex decision logic.",
    details:
      "Simple skills are checklists or step sequences for common tasks. Examples: a debug-pods skill listing kubectl commands, an auth-setup skill with credential configuration steps.",
    scannable: false,
    detection: { type: "any-of", pattern: [".claude/skills/", ".claude/commands/", "skills/"] },
  },
  // Cross-cutting Learning items assigned to L2
  {
    id: "acmm:correction-capture",
    source: "acmm",
    level: 2,
    category: "learning",
    name: "Correction capture",
    description:
      "A mechanism that captures user corrections during agent sessions and persists them so the same mistake isn't repeated.",
    rationale: "Without capturing corrections, every session starts from the same mistakes.",
    details:
      "When a user says \"no, don't use that approach,\" the correction is appended to a persistent store that future sessions read. Claude Code's memory system is one implementation.",
    scannable: false,
    detection: { type: "any-of", pattern: [".claude/memory/", ".memory/", "corrections.jsonl"] },
    crossCutting: "learning",
  },
  {
    id: "acmm:positive-reinforcement",
    source: "acmm",
    level: 2,
    category: "learning",
    name: "Positive reinforcement capture",
    description:
      "A mechanism that captures confirmations of non-obvious correct behavior, not just corrections.",
    rationale:
      "Records what works, not just what doesn't — prevents the system from becoming overly cautious.",
    scannable: false,
    details:
      'When a user says "yes, exactly like that" after a non-obvious approach, the reinforcement is captured and persisted for future sessions.',
    detection: { type: "path", pattern: ".claude/memory/" },
    crossCutting: "learning",
  },

  // ── L3 — Measured / Enforced ────────────────────────────────────
  {
    id: "acmm:pr-acceptance-metric",
    source: "acmm",
    level: 3,
    category: "feedback-loop",
    name: "PR acceptance tracking",
    description: "Scheduled job that tracks AI PR acceptance rate over time.",
    rationale: "L3 meta-metric: measuring the feedback loop itself, not just the code.",
    details:
      "PR acceptance tracking is a scheduled job that measures what percentage of AI-generated PRs are merged vs. rejected over time. This meta-metric tells you whether your AI instructions are actually working — a declining acceptance rate means the instructions need updating. An AI mission will add a script that queries your GitHub PR history and writes acceptance metrics to a tracking file.",
    detection: {
      type: "any-of",
      pattern: [
        "scripts/build-accm-history.mjs",
        ".github/workflows/accm-history-update.yml",
        "scripts/pr-metrics.mjs",
      ],
    },
    referencePath: "scripts/build-accm-history.mjs",
  },
  {
    id: "acmm:pr-review-rubric",
    source: "acmm",
    level: 3,
    category: "feedback-loop",
    name: "PR review rubric",
    description: "Committed rubric the AI follows when reviewing PRs.",
    rationale: 'L3 signal: the quality criteria for "is this PR ok" are now written down.',
    details:
      "A PR review rubric is a document listing the specific quality criteria reviewers (human or AI) should check: error handling, test coverage, naming conventions, security patterns, etc. Without it, reviews are subjective and inconsistent — one reviewer checks for error handling while another focuses on style. An AI mission will create a review rubric based on your project's past review comments and common feedback themes.",
    detection: {
      type: "any-of",
      pattern: [
        ".github/review-rubric.md",
        "docs/review-criteria.md",
        ".github/prompts/review.md",
        "docs/qa/",
      ],
    },
  },
  {
    id: "acmm:quality-dashboard",
    source: "acmm",
    level: 3,
    category: "observability",
    name: "Quality dashboard",
    description: "A dashboard or page that renders the AI loop metrics.",
    rationale: "L3 visibility: metrics you can see are the ones that get acted on.",
    details:
      "A quality dashboard is a visible page or widget that renders your AI loop metrics — PR acceptance rates, coverage trends, review turnaround, test pass rates — in one place. Metrics that are not visible are metrics that get ignored; a dashboard makes them actionable. An AI mission will create an analytics page or embed that pulls data from your CI and displays it as charts and trend lines.",
    detection: {
      type: "grep",
      pattern: { file: "apps/marketing/src/App.tsx", contains: "/metrics" },
    },
    referencePath: "apps/marketing/src/App.tsx",
  },
  {
    id: "acmm:ci-matrix",
    source: "acmm",
    level: 3,
    category: "feedback-loop",
    name: "CI matrix",
    description: "Matrix CI testing multiple platforms/versions.",
    rationale: "L3 breadth: coverage across the real deployment envelope.",
    details:
      "A CI matrix runs your test suite across multiple combinations of OS, language version, and architecture.",
    detection: {
      type: "any-of",
      pattern: [
        ".github/workflows/build.yml",
        ".github/workflows/build-deploy.yml",
        ".github/workflows/ci.yml",
        ".github/workflows/test.yml",
      ],
    },
  },
  {
    id: "acmm:context-budget",
    source: "acmm",
    level: 3,
    category: "readiness",
    name: "Context budget management",
    description:
      "Controlling how much of the AI's context window is consumed by command output, reference material, and verbose logs.",
    rationale: "Uncontrolled output floods the context window, degrading reasoning quality.",
    scannable: false,
    details:
      "Tightened from = CLAUDE.md existence (#5851) to the actual rule text: gotchas.md documents that oversized tool results are written to disk, not held in context, and must be read back with jq rather than re-run.",
    detection: {
      type: "grep",
      pattern: {
        file: ".claude/rules/gotchas.md",
        contains: "Large MCP results land on disk, not in context",
      },
    },
  },
  {
    id: "acmm:model-tiering",
    source: "acmm",
    level: 3,
    category: "readiness",
    name: "Model tiering for subagents",
    description:
      "Using cheaper models for mechanical tasks and reserving the session model for reasoning tasks.",
    rationale: "Not every task needs the most capable model — tiering saves cost and context.",
    scannable: false,
    details:
      "Tightened from = CLAUDE.md existence (#5851) to the actual rule text: AGENTS.md's Model Governance section states a 3-tier (Haiku/Sonnet/Opus) cost strategy.",
    detection: {
      type: "grep",
      pattern: { file: "AGENTS.md", contains: "model tiering strategy" },
    },
  },
  {
    id: "acmm:verify-before-reporting",
    source: "acmm",
    level: 3,
    category: "readiness",
    name: "Verify-before-reporting practices",
    description: "Workflows require the AI to show evidence before accepting completion claims.",
    rationale:
      "Treat AI completion claims the way you'd treat a junior developer saying \"it's done.\"",
    scannable: false,
    details:
      "Tightened from = CLAUDE.md existence (#5851) to the actual rule text: AGENTS.md's Zero-Touch Audit checklist requires showing command output, not just claiming tests passed.",
    detection: {
      type: "grep",
      pattern: { file: "AGENTS.md", contains: "Verified verification" },
    },
  },
  {
    id: "acmm:evidence-antipatterns",
    source: "acmm",
    level: 3,
    category: "governance",
    name: "Evidence-based antipattern rules",
    description:
      "Numbered coding rules where every rule traces to a real bug with a PR or issue number.",
    rationale: "Rules without evidence are opinions; rules with evidence are lessons.",
    scannable: false,
    details:
      "Tightened from = CLAUDE.md existence (#5851): checks that .claude/rules/gotchas.md — this repo's evidence-based antipattern list — actually cites multiple real issue/PR numbers as evidence, rather than just existing.",
    detection: { type: "check", pattern: ".claude/rules/gotchas.md" },
    check: checkEvidenceAntipatterns,
  },
  // Cross-cutting items assigned to L3
  {
    id: "acmm:session-summary",
    source: "acmm",
    level: 3,
    category: "learning",
    name: "Session summary artifact",
    description:
      "An end-of-session artifact that records what changed, what was tried, and what was learned.",
    rationale: "Provides handoff context for the next session or developer.",
    details:
      "A Stop hook writes to .claude/session-summary.md: branch, files changed, tests added, approaches tried, open questions. The next session reads this at startup.",
    scannable: false,
    detection: { type: "any-of", pattern: [".claude/session-summary.md", ".claude/checkpoint.md"] },
    crossCutting: "learning",
  },
  {
    id: "acmm:structural-gates",
    source: "acmm",
    level: 3,
    category: "traceability",
    name: "Structural gates",
    description:
      "Config-enforced gates that block agents from touching protected areas without review.",
    rationale: "Regardless of what the AI thinks it should do, some paths require human approval.",
    details:
      "A settings.json deny list blocking writes to deploy/production/, migrations/, and .github/workflows/. Changes to these paths require human approval even in autonomous mode. Tightened (#5851, absorbs the former acmm:layered-safety and acmm:mechanical-enforcement — both were the identical `.claude/settings.json`-exists check under a different name): requires an actual PreToolUse hook entry, not just file presence.",
    scannable: false,
    detection: {
      type: "grep",
      pattern: { file: ".claude/settings.json", contains: "PreToolUse" },
    },
    crossCutting: "traceability",
  },

  // ── L4 — Adaptive / Structured ──────────────────────────────────
  {
    id: "acmm:auto-qa-tuning",
    source: "acmm",
    level: 4,
    category: "self-tuning",
    name: "Auto-QA self-tuning config",
    description: "A config file that tunes review prompts based on the L3 metrics.",
    rationale: "L4 loop-closing signal: metrics feeding back into instructions automatically.",
    details:
      "An auto-QA tuning config is a JSON or YAML file that adjusts review strictness and prompt templates based on your L3 metrics — for example, tightening coverage requirements when acceptance rate is high, or relaxing style checks when they generate too many false positives. This closes the loop: metrics drive instructions, not just reports. An AI mission will create a tuning config that references your metrics and defines adjustment rules.",
    detection: {
      type: "any-of",
      pattern: [".github/auto-qa-tuning.json", ".github/qa-tuning.yml"],
    },
  },
  {
    id: "acmm:nightly-compliance",
    source: "acmm",
    level: 4,
    category: "feedback-loop",
    name: "Nightly compliance scan",
    description: "Scheduled workflow that re-validates the codebase against its rules every night.",
    rationale: "L4 drift detection: noticing when the loop itself has broken.",
    details:
      "A nightly compliance scan is a scheduled CI workflow that runs your full test suite, linters, and security checks on a cron schedule (typically every night). It catches regressions that slip through PR-level checks — like a dependency update that passes its own tests but breaks an unrelated feature. An AI mission will add a nightly GitHub Actions workflow that runs your complete validation pipeline and opens issues on failure.",
    detection: {
      type: "active",
      pattern: [
        ".github/workflows/nightly-compliance.yml",
        ".github/workflows/nightly.yml",
        ".github/workflows/nightly-test.yml",
        ".github/workflows/nightly-test-suite.yml",
      ],
      maxAgeDays: 7,
    },
  },
  {
    id: "acmm:copilot-review-apply",
    source: "acmm",
    level: 4,
    category: "feedback-loop",
    name: "Automated review application",
    description: "Workflow that applies AI-review suggestions automatically to PRs.",
    rationale:
      "L4 action-taking: the loop closes when suggestions become commits without human intervention.",
    details:
      'Automated review application is a workflow that takes AI-generated review comments and applies the suggested fixes directly as commits on the PR branch. Instead of a human reading "change X to Y" and making the edit, the system does it automatically. This is L4 because the feedback loop acts on its own output. An AI mission will add a workflow that parses review bot suggestions and commits the fixes.',
    detection: {
      type: "active",
      pattern: [".github/workflows/copilot-review-apply.yml", ".github/workflows/ai-fix.yml"],
      maxAgeDays: 30,
    },
  },
  {
    id: "acmm:auto-label",
    source: "acmm",
    level: 4,
    category: "feedback-loop",
    name: "Automated issue labeling",
    description: "Workflow or bot config that triages new issues with AI.",
    rationale: "L4 triage automation: removes a human step from the default path.",
    details:
      "Automated issue labeling uses AI or pattern-matching rules to classify new issues with labels (bug, feature, docs, priority) the moment they are filed. Without it, issues sit unlabeled until a human triages them, which can take hours or days. An AI mission will add a GitHub Actions workflow or labeler config that reads issue titles and bodies and applies the appropriate labels automatically.",
    detection: {
      type: "any-of",
      pattern: [
        ".github/workflows/auto-label.yml",
        ".github/labeler.yml",
        ".github/workflows/triage.yml",
      ],
    },
  },
  {
    id: "acmm:ai-fix-workflow",
    source: "acmm",
    level: 4,
    category: "feedback-loop",
    name: "AI-fix-requested workflow",
    description: "A workflow or label that dispatches AI agents on issues marked for fix.",
    rationale: 'L4 intent channel: humans express "fix this" as data; the loop executes.',
    details:
      'An AI-fix-requested workflow watches for a specific label (like "ai-fix-requested") on issues and automatically dispatches an AI agent to attempt a fix, create a branch, and open a PR. Humans express intent by labeling; the system executes. This is the core L4 pattern: humans set direction, machines do the work. An AI mission will add a workflow that triggers on label events and dispatches an agent to fix the issue.',
    detection: {
      type: "any-of",
      pattern: [
        ".github/workflows/ai-fix.yml",
        ".github/workflows/fix-requested.yml",
        ".github/workflows/claude.yml",
      ],
    },
  },
  {
    id: "acmm:tier-classifier",
    source: "acmm",
    level: 4,
    category: "governance",
    name: "Change classification policy",
    description:
      "Workflow or policy that classifies changes by risk tier and routes review accordingly.",
    rationale: "L4 risk-aware routing: not every change gets the same scrutiny.",
    details:
      "A change-tier classifier is a workflow that analyzes each PR's files, size, and content to assign a risk tier (e.g., T1-trivial, T2-standard, T3-critical). Low-risk changes like docs or config updates get fast-tracked, while high-risk changes touching auth or database schemas require senior review. An AI mission will add a classifier workflow that reads the diff and assigns a tier label based on configurable rules.",
    detection: {
      type: "any-of",
      pattern: [".github/workflows/tier-classifier.yml", ".github/workflows/pr-size.yml"],
    },
  },
  {
    id: "acmm:security-ai-md",
    source: "acmm",
    level: 4,
    category: "governance",
    name: "AI security policy",
    description: "A SECURITY-AI.md or equivalent defining what the AI is and is not allowed to do.",
    rationale: "L4 policy: the rules the self-tuning system cannot override.",
    details:
      "SECURITY-AI.md is a policy document that defines hard boundaries for AI agents: files they must never modify, secrets they must never access, destructive operations they must never run, and approval gates they must never skip. As AI autonomy increases, these guardrails prevent the system from optimizing its way into a security incident. An AI mission will create a SECURITY-AI.md tailored to your project's sensitive areas and compliance requirements.",
    detection: {
      type: "any-of",
      pattern: ["SECURITY-AI.md", "docs/security/threat-model.md", "docs/SECURITY-AI.md"],
    },
    referencePath: "docs/security/threat-model.md",
  },
  {
    id: "acmm:multi-perspective-review",
    source: "acmm",
    level: 4,
    category: "feedback-loop",
    name: "Multi-perspective review",
    description:
      "Multiple independent review perspectives dispatched in parallel with a convergence loop.",
    rationale:
      "Findings tallied independently and a convergence loop until zero critical issues remain.",
    scannable: false,
    details:
      "Tightened (#5851, absorbs the former acmm:{structured-workflows, router-skills, tdd-workflows, structured-rca} — all four were the identical `.claude/skills/`-exists check under a different name): requires ≥2 dedicated reviewer subagents, this repo's actual multi-perspective mechanism.",
    detection: { type: "check", pattern: ".claude/agents/" },
    check: checkMultiPerspectiveReview,
  },
  {
    id: "acmm:idempotent-workflows",
    source: "acmm",
    level: 4,
    category: "readiness",
    name: "Idempotent and resumable workflows",
    description: "Workflows derive state from durable infrastructure rather than session memory.",
    rationale: "A new session picks up where the last one left off without explanation.",
    scannable: false,
    details:
      "Tightened (#5851): = CLAUDE.md existence passed regardless of content. No committed rule in CLAUDE.md, AGENTS.md, or .claude/rules/** actually states this practice yet — fails honestly until one does.",
    detection: {
      type: "grep",
      pattern: {
        file: "AGENTS.md",
        contains: "derives? its state from (git|gh|durable infrastructure)",
      },
    },
  },
  {
    id: "acmm:session-continuity",
    source: "acmm",
    level: 4,
    category: "learning",
    name: "Session continuity",
    description: "A persistent record the agent reads at session start to recover prior context.",
    rationale:
      "Bridges the gap between what git/CI can tell you (what was done) and what can't be derived (what was planned).",
    details:
      "A .claude/checkpoint.md recording current branch, active worktree, plan path, completed tasks, and remaining steps. A Stop hook auto-updates it at session end.",
    scannable: false,
    detection: {
      type: "grep",
      pattern: { file: ".claude/session-summary.md", contains: "\\d{4}-\\d{2}-\\d{2}" },
    },
    crossCutting: "learning",
  },
  {
    id: "acmm:instruction-sync-gate",
    source: "acmm",
    level: 3,
    category: "feedback-loop",
    name: "Instruction sync gate (llms.txt)",
    description:
      "CI check that verifies AI context skeletons (llms.txt) are in sync with the current code.",
    rationale:
      "Prevents instruction rot by ensuring the AI's view of the codebase is always accurate.",
    details:
      'A CI step runs `pnpm regen --check` to verify that the committed `llms.txt`/registry files match what would be generated from the current source. Tightened (#5851, absorbs the former acmm:component-registry-integrity — the same step covers the registry): `active` used to mean "any ci.yml success", which is true for nearly every PR whether or not the real step exists. Requires the step text present AND a recent successful run on main.',
    detection: { type: "check", pattern: ".github/workflows/ci.yml" },
    check: checkInstructionSyncGate,
  },
  {
    id: "acmm:instruction-rot-detection",
    source: "acmm",
    level: 4,
    category: "feedback-loop",
    name: "Instruction rot detection",
    description:
      "Automated detection of dead links and stale package references in instruction files.",
    rationale:
      "Instructions with dead links or deleted package references confuse AI agents and waste context.",
    details:
      'A script scans `CLAUDE.md`, `AGENTS.md`, and `llms.txt` for internal links to non-existent files or references to deleted packages, failing the build on detection. Tightened (#5851): `active` used to mean "any ci.yml success", true regardless of whether this step exists. Requires the step text present AND a recent successful run on main.',
    detection: { type: "check", pattern: ".github/workflows/ci.yml" },
    check: checkInstructionRotDetection,
  },
  // Cross-cutting items assigned to L4
  {
    id: "acmm:feedback-loops",
    source: "acmm",
    level: 4,
    category: "learning",
    name: "Self-improving feedback loops",
    description: "Systems that encode learnings from AI sessions back into the tooling.",
    rationale:
      "Each learning gets routed to the right output channel: knowledge base, antipattern rule, CLAUDE.md update, hook, or skill deletion.",
    scannable: false,
    details:
      "A session retrospective skill that analyzes repeated commands, debugging cycles, and revert/fix chains, routes learnings to the appropriate persistence layer, and appends each run to a dated, append-only loop record. Detection resolves that record; substance reads its newest entry, so the loop counts as live only if it wrote something in the last 30 days.",
    detection: {
      type: "any-of",
      pattern: [
        ".claude/improvement-loop/log.md",
        ".claude/improvement-loop/",
        "improvement-loop.md",
      ],
    },
    crossCutting: "learning",
  },
  {
    id: "acmm:claude-md-auto-sync",
    source: "acmm",
    level: 4,
    category: "learning",
    name: "CLAUDE.md auto-sync",
    description:
      "A workflow that syncs captured corrections and preferences into CLAUDE.md automatically.",
    rationale: "Keeps instruction files current with accumulated learnings without manual editing.",
    scannable: false,
    details:
      "A weekly workflow reviews new entries in the knowledge base and correction log, drafts updates to CLAUDE.md, and opens a PR for human review before merging.",
    detection: {
      type: "active",
      pattern: [".github/workflows/claude-md-sync.yml"],
      maxAgeDays: 14,
    },
    crossCutting: "learning",
  },
  // ── L5 — Semi-Automated ────────────────────────────
  {
    id: "acmm:github-actions-ai",
    source: "acmm",
    level: 5,
    category: "feedback-loop",
    name: "GitHub Actions AI integration",
    description:
      "GitHub Actions trigger AI-assisted workflows automatically on CI failures, PR events, or @claude mentions.",
    rationale: "Detection and proposed resolution happen without human initiation.",
    details:
      "A claude.yml workflow triggers on @claude mentions in issues and PR comments. A code-review workflow auto-reviews every PR on open/synchronize events.",
    detection: {
      type: "any-of",
      pattern: [".github/workflows/claude.yml", ".github/workflows/claude-code-review.yml"],
    },
  },
  {
    id: "acmm:auto-qa-self-tuning",
    source: "acmm",
    level: 5,
    category: "self-tuning",
    name: "Auto-QA with self-tuning",
    description:
      "An automated quality system that tracks suggestion acceptance rates and adjusts its own sensitivity thresholds.",
    rationale: "The system improves its own review quality without human tuning.",
    details:
      "An auto-qa workflow runs 4x/day. The companion auto-qa-tuner tracks acceptance rates: types above 80% get boosted, types below 20% get blocked.",
    detection: {
      type: "any-of",
      pattern: [".github/workflows/auto-qa.yml", ".github/auto-qa-tuning.json"],
    },
  },
  {
    id: "acmm:public-metrics",
    source: "acmm",
    level: 5,
    category: "observability",
    name: "Public metrics endpoint",
    description:
      "A published metrics endpoint or analytics page that external reviewers can audit.",
    rationale: "The self-running codebase must be inspectable from outside.",
    details:
      "A public metrics endpoint is an API or web page that exposes your project's health and maturity metrics to external stakeholders — CNCF reviewers, adopters, or the community. It makes the project's quality claims verifiable rather than self-reported. Retargeted (#5851): the old grep matched only the `pages: write` permission line pr-metrics.yml carried for this scanner's own benefit, not a real Pages deploy. The real published surface is apps/marketing's /metrics page, backed by the committed metrics.json data file.",
    detection: { type: "path", pattern: "apps/marketing/public/metrics.json" },
  },
  {
    id: "acmm:policy-as-code",
    source: "acmm",
    level: 5,
    category: "governance",
    name: "Policy as code",
    description: "Policies expressed as machine-enforceable code (OPA, ConfTest, etc.).",
    rationale: "Policies that cannot drift because they are executed, not documented.",
    details:
      "Policy as code means your governance rules (who can merge what, which files need senior review, which APIs are deprecated) are written as executable code using tools like OPA or ConfTest, not as wiki pages that drift. The system enforces them automatically on every PR. An AI mission will identify your implicit policies from code review history and express them as machine-enforceable rules.",
    detection: {
      type: "any-of",
      pattern: [".github/policies/", "policy/", "conftest.yaml", "opa/"],
    },
  },
  {
    id: "acmm:reflection-log",
    source: "acmm",
    level: 5,
    category: "feedback-loop",
    name: "Reflection log",
    description:
      "A committed log where the AI records lessons learned that feed back into instruction files.",
    rationale: "The codebase records what changed its own behavior.",
    details:
      "A reflection log is a committed file or directory where AI agents record what they learned during a session — patterns that worked, mistakes that were corrected, conventions that were unclear. These reflections feed back into instruction files so future sessions start smarter. An AI mission will create a reflections directory and add a post-session hook that appends lessons learned.",
    detection: {
      type: "any-of",
      pattern: ["docs/reflections/", "memory/", ".memory/", "REFLECTIONS.md"],
    },
    crossCutting: "learning",
  },
  // Cross-cutting items assigned to L5
  {
    id: "acmm:periodic-reflection",
    source: "acmm",
    level: 5,
    category: "learning",
    name: "Periodic reflection review",
    description: "A scheduled job that surfaces captured reflections for human review and pruning.",
    rationale: "Prevents the knowledge base from growing stale.",
    scannable: false,
    details:
      "A monthly cron posts a summary of new knowledge base entries, correction captures, and preference changes to a GitHub issue for the team to review, confirm, and prune.",
    detection: {
      type: "active",
      pattern: [".github/workflows/reflection-review.yml"],
      maxAgeDays: 45,
    },
    crossCutting: "learning",
  },
  {
    id: "acmm:audit-trail",
    source: "acmm",
    level: 5,
    category: "traceability",
    name: "Audit trail workflow",
    description:
      "A workflow that records agent-generated PRs and attributes them for later review.",
    rationale: "Distinguishes human-authored from AI-authored changes.",
    details:
      "A GitHub Action that adds a label (ai-generated) to PRs created by AI, and appends session statistics as a PR comment.",
    detection: {
      type: "any-of",
      pattern: [".github/workflows/audit-trail.yml", ".github/workflows/ai-attribution.yml"],
    },
    crossCutting: "traceability",
  },
  // ── L6 — Autonomous ─────────────────────────────────────────────
  {
    id: "acmm:auto-issue-gen",
    source: "acmm",
    level: 6,
    category: "autonomy",
    name: "Automated issue generation",
    description:
      "Workflow or cron that generates work items for the AI to pick up — the system identifies its own problems and creates tasks.",
    rationale: "L6 self-direction: the codebase proposes its own next task.",
    details:
      "Automated issue generation is a cron-triggered workflow that scans the codebase for TODOs, stale dependencies, failing tests, or coverage gaps and files GitHub issues for each finding. The codebase identifies its own work rather than waiting for humans to notice problems. Retargeted (#5851 amendment): auto-issue.yml is this ACMM scanner's own workflow, so the scanner satisfied its own L6 criterion regardless of whether the automation actually filed anything (it created 0 issues at L6). New evidence: at least one issue filed in the last 30 days by other automation (sentry-triage, site-audit, learning-loop), carrying an automation label.",
    detection: { type: "check", pattern: "github:automation-issues" },
    check: checkAutoIssueGen,
  },
  {
    id: "acmm:multi-agent-orchestration",
    source: "acmm",
    level: 6,
    category: "autonomy",
    name: "Multi-agent orchestration",
    description:
      "A workflow or script that coordinates multiple AI agents on one task, decomposing work and managing parallel execution.",
    rationale: "L6 composition: single agents become units of a larger autonomous system.",
    details:
      "Multi-agent orchestration uses a dispatcher script or workflow to coordinate multiple AI agents working on different parts of one task — for example, one agent fixes the bug while another writes the test and a third updates the docs. This parallelism is what makes L5 codebases productive beyond what a single agent can achieve. An AI mission will add an orchestration script that decomposes tasks and dispatches sub-agents.",
    detection: {
      type: "any-of",
      pattern: ["scripts/orchestrate.mjs", ".github/workflows/orchestrate.yml", "orchestrator/"],
    },
  },
  {
    id: "acmm:merge-queue",
    source: "acmm",
    level: 6,
    category: "autonomy",
    name: "Merge queue / auto-merge",
    description:
      "Branch protection with automated merge queue, allowing verified AI-generated PRs to merge without manual intervention.",
    rationale: "L6 throughput: humans no longer gate individual merges, only the queue config.",
    details:
      'A merge queue automatically batches, tests, and merges approved PRs in dependency order without human intervention. Humans configure the queue rules (required checks, approval count) but do not manually click "merge" on each PR. This removes the last human bottleneck from the PR lifecycle. An AI mission will configure branch protection with a merge queue or add a Tide-style auto-merge workflow.',
    detection: {
      type: "any-of",
      pattern: [".github/workflows/merge-queue.yml", ".prow.yaml", "tide.yaml"],
    },
  },
  {
    id: "acmm:strategic-dashboard",
    source: "acmm",
    level: 6,
    category: "observability",
    name: "Strategic dashboard",
    description:
      "A human-facing dashboard that shows what the codebase is doing on its own — active AI sessions, pending fixes, merge pipeline, trend data.",
    rationale:
      "L6 accountability: humans need visibility into autonomous behavior without micromanaging it.",
    details:
      "A strategic dashboard shows humans what the autonomous system is doing: which issues it generated, which fixes it attempted, which PRs it merged, and what the trend lines look like. Without it, an L5 codebase becomes a black box. An AI mission will create a dashboard page that aggregates autonomous activity into a single human-readable view.",
    detection: {
      type: "any-of",
      pattern: [
        "web/src/components/acmm/",
        "web/public/analytics.js",
        "docs/autonomous-work-log.md",
      ],
    },
  },
  {
    id: "acmm:risk-assessment-config",
    source: "acmm",
    level: 6,
    category: "governance",
    name: "Risk assessment config",
    description:
      "A config that lets the agent assess blast radius before acting — preventing autonomous changes to high-risk areas.",
    rationale: "Without risk awareness, autonomous changes can touch production paths unchecked.",
    details:
      'A config defining: high_risk: ["deploy/", "migrations/", "security/"] — changes to these paths require human review regardless of AI confidence.',
    detection: {
      type: "any-of",
      pattern: ["risk-config.json", ".claude/risk-config.json", ".github/risk-assessment.yml"],
    },
  },
  {
    id: "acmm:production-feedback",
    source: "acmm",
    level: 6,
    category: "feedback-loop",
    name: "Production feedback signal",
    description: "A mechanism that feeds production observations back into the development loop.",
    rationale: "Closes the gap between deployment and development.",
    scannable: false,
    details:
      "Error rates from production monitoring creating GitHub issues tagged production-regression, which trigger RCA workflows.",
    detection: {
      type: "active",
      pattern: [".github/workflows/production-feedback.yml"],
      maxAgeDays: 30,
    },
  },
  {
    id: "acmm:observability-runbook",
    source: "acmm",
    level: 6,
    category: "governance",
    name: "Observability runbook",
    description:
      "A runbook describing how humans debug autonomous behavior — what to check when the AI does something unexpected.",
    rationale: "Humans need a guide for understanding and overriding autonomous decisions.",
    details:
      "A docs/ai-ops-runbook.md covering: how to review agent session transcripts, trace a commit back to its trigger issue, and pause autonomous workflows.",
    detection: {
      type: "any-of",
      pattern: ["docs/ai-ops-runbook.md", "docs/runbook/", "RUNBOOK.md"],
    },
  },
  {
    id: "acmm:rollback-drill",
    source: "acmm",
    level: 6,
    category: "governance",
    name: "Rollback drill",
    description:
      "A documented or automated rollback procedure for when autonomous changes cause problems.",
    rationale: "Autonomy without a kill switch is recklessness.",
    scannable: false,
    details:
      'A documented procedure: "If a nightly AI-merged PR breaks production: (1) revert PR, (2) disable auto-merge, (3) file incident issue, (4) RCA workflow runs on the reverted commit."',
    detection: {
      type: "grep",
      pattern: { file: "docs/rollback.md", contains: "Last drill: \\d{4}" },
    },
  },
  {
    id: "acmm:accessibility-ai-check",
    source: "acmm",
    level: 5,
    category: "governance",
    name: "Accessibility checks for AI code",
    description: "Accessibility regression checks specifically targeting AI-generated UI code.",
    rationale:
      "L5 signal: AI can inadvertently introduce a11y regressions that axe-core catches, but without agent-specific tracking the pattern goes unnoticed.",
    details:
      "AI-generated Rialto components could miss ARIA attributes or keyboard navigation. Agent-specific a11y tracking ensures these patterns are caught and trended, adding a safety net beyond the existing per-component axe tests. Fixed a false negative (#5851): the real job is `a11y-attribution` in ci.yml, which only runs on agent PR branches — an `active` (workflow-run) check would misread that as inactive, so this stays a `grep` on the step text.",
    detection: {
      type: "grep",
      pattern: {
        file: ".github/workflows/ci.yml",
        contains:
          "pnpm --filter @mattbutlerengineering/rialto exec vitest run .* src/test/accessibility",
      },
    },
  },

  {
    id: "acmm:auto-rollback",
    source: "acmm",
    level: 6,
    category: "autonomy",
    name: "Automated rollback",
    description: "Automated detection and revert of regressions caused by AI-authored changes.",
    rationale:
      "L6 signal: the system not only acts but also undoes mistakes without human initiation.",
    details:
      "Auto-rollback completes the autonomous loop: the system detects regressions from its own PRs (via post-deploy checks) and creates revert PRs automatically. Without this, L6 autonomy is one-directional — the system can break things but not fix them.",
    detection: {
      type: "active",
      pattern: [".github/workflows/auto-rollback.yml", "docs/acmm/auto-rollback.md"],
      maxAgeDays: 90,
    },
  },
];

export const acmmSource = {
  id: "acmm",
  name: "AI Codebase Maturity Model",
  url: "https://arxiv.org/abs/2604.09388",
  citation: "Anderson, A. (2026). The AI Codebase Maturity Model. arXiv:2604.09388",
  definesLevels: true,
  levels: LEVELS,
  criteria: CRITERIA,
};
