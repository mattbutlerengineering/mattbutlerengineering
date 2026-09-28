import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync as _execFileSync } from "node:child_process";

const GOVERNANCE_DOC = "docs/governance.md";

const REQUIRED_CHECKS_HEADING = "### Required Status Checks";

/**
 * The bolded check names in the doc's "Required Status Checks" table, e.g.
 * `| **Lint** | ci.yml | ... |` -> "Lint". Scoped to the lines between that
 * heading and the next `#`-heading — docs/governance.md has a second
 * bolded-row table further down ("Human Review Required": **Security**,
 * **Infrastructure**, ...) that is not a status-check list at all. An
 * unscoped scan over the whole document folded those rows in too, so the
 * criterion could never pass even once the real table said just CI Gate.
 */
function parseDocumentedChecks(content) {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === REQUIRED_CHECKS_HEADING);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,6}\s/.test(line));
  const section = end === -1 ? rest : rest.slice(0, end);
  return section
    .map((line) => line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

/**
 * acmm:fullsend:branch-protection-doc — compares the checks docs/governance.md
 * claims are required against the live `required_status_checks.contexts` for
 * `main`. Was `any-of` (doc existence only): the doc lists Lint/Typecheck/
 * Test/Security Scan/Tier Classifier while live protection is `["CI Gate"]`
 * (`strict: false`) — a doc that contradicts reality passed identically to
 * one that's accurate. `gh` unavailable -> unverifiable, not a silent pass.
 */
export function checkBranchProtectionDoc(cwd, opts = {}) {
  const fn = opts.execFileSyncFn ?? _execFileSync;
  const docPath = join(cwd, GOVERNANCE_DOC);
  if (!existsSync(docPath)) {
    return { passed: false, evidence: `${GOVERNANCE_DOC} not found` };
  }
  let content;
  try {
    content = readFileSync(docPath, "utf-8");
  } catch {
    return { passed: false, evidence: `${GOVERNANCE_DOC} unreadable` };
  }
  const documented = parseDocumentedChecks(content);
  if (documented.length === 0) {
    return { passed: false, evidence: `${GOVERNANCE_DOC} lists no required checks` };
  }

  let liveContexts;
  try {
    const raw = fn(
      "gh",
      [
        "api",
        "repos/{owner}/{repo}/branches/main/protection/required_status_checks",
        "--jq",
        ".contexts",
      ],
      { cwd, encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] }
    );
    liveContexts = JSON.parse(raw);
  } catch {
    return {
      passed: null,
      evidence: "gh CLI unavailable or error querying branch protection",
    };
  }

  const documentedSet = new Set(documented);
  const liveSet = new Set(liveContexts);
  const matches =
    documentedSet.size === liveSet.size && [...documentedSet].every((c) => liveSet.has(c));

  if (matches) {
    return {
      passed: true,
      evidence: `${GOVERNANCE_DOC} matches live required checks: ${liveContexts.join(", ")}`,
    };
  }
  return {
    passed: false,
    evidence: `${GOVERNANCE_DOC} lists [${[...documentedSet].join(", ")}] but live required checks are [${liveContexts.join(", ")}]`,
  };
}

const CRITERIA = [
  {
    id: "fullsend:auto-merge-policy",
    source: "fullsend",
    level: 3,
    category: "autonomy",
    name: "Auto-merge policy",
    description: "Explicit policy for when PRs auto-merge vs. escalate to humans.",
    rationale:
      'Fullsend\'s "When to auto-merge vs. escalate to humans" dimension — this is where the autonomy boundary gets drawn.',
    details:
      "An auto-merge policy explicitly documents which PRs can merge automatically (e.g., dependency updates, typo fixes) and which require human review (e.g., API changes, security-sensitive code). Without this boundary, either everything needs manual approval (slow) or nothing does (dangerous). An AI mission will create a policy document and auto-merge workflow based on your project's risk tolerance.",
    detection: {
      type: "any-of",
      pattern: [
        ".github/auto-merge.yml",
        ".prow.yaml",
        "tide.yaml",
        ".github/workflows/auto-merge.yml",
      ],
    },
  },
  {
    id: "fullsend:branch-protection-doc",
    source: "fullsend",
    level: 3,
    category: "governance",
    name: "Branch protection documentation",
    description: "Documented branch protection rules (required reviews, status checks).",
    rationale:
      "Autonomy only works on top of explicit protection rules — fullsend treats these as the fence inside which agents may act.",
    details:
      "Branch protection documentation spells out the rules governing your main branch: how many reviews are required, which CI checks must pass, who can bypass protections. This is the fence inside which AI agents can safely operate — without documented protection, there is no clear boundary for autonomous behavior. Tightened (#5851/#5853): compares the doc's claimed required checks against the live `required_status_checks` API response instead of trusting the doc's mere existence.",
    detection: { type: "check", pattern: GOVERNANCE_DOC },
    check: checkBranchProtectionDoc,
  },
];

export const fullsendSource = {
  id: "fullsend",
  name: "Fullsend",
  url: "https://github.com/fullsend-ai/fullsend",
  citation:
    "Fullsend: Vision for fully autonomous agentic engineering. github.com/fullsend-ai/fullsend",
  definesLevels: false,
  criteria: CRITERIA,
};
