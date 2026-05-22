import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { resolveModelId } from "./model-router.js";

const execFileAsync = promisify(execFile);

// ── Types ───────────────────────────────────────────────────────────

export interface EvaluationResult {
  readonly passed: boolean;
  readonly confidence: number;
  readonly reasoning: string;
  readonly issues: readonly string[];
}

export interface EvaluationConfig {
  readonly model: string;
  readonly maxBudgetUsd: number;
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  model: resolveModelId("haiku"),
  maxBudgetUsd: 0.05,
};

const INCONCLUSIVE_RESULT: EvaluationResult = {
  passed: true,
  confidence: 0,
  reasoning: "Evaluation unavailable — defaulting to pass",
  issues: [],
};

const MAX_DIFF_LENGTH = 50_000;

/**
 * Extract the body of a markdown section by heading text.
 * Uses indexOf for linear-time safety (no regex backtracking).
 * Returns null if the heading is not found.
 */
function extractMarkdownSection(text: string, headingPattern: RegExp): string | null {
  // Find the heading line-by-line to avoid ReDoS on the full text
  const lines = text.split("\n");
  let startIdx = -1;
  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    if (headingPattern.test(lines[i])) {
      // Start capturing from the line after the heading
      startIdx = charOffset + lines[i].length + 1; // +1 for the \n
      break;
    }
    charOffset += lines[i].length + 1;
  }

  if (startIdx === -1 || startIdx >= text.length) return null;

  const body = text.slice(startIdx);

  // Find the next section boundary: "\n##" or "\n---"
  let endIdx = body.length;
  const nextHeading = body.indexOf("\n##");
  const nextHr = body.indexOf("\n---");

  if (nextHeading !== -1 && nextHeading < endIdx) endIdx = nextHeading;
  if (nextHr !== -1 && nextHr < endIdx) endIdx = nextHr;

  return body.slice(0, endIdx);
}

// ── Skip-evaluation heuristics ──────────────────────────────────────

export interface ShouldEvaluateConfig {
  /** Whether tests passed during the agent run */
  readonly testsPassed?: boolean;
  /** Commit title, used for dependency bump detection */
  readonly commitTitle?: string;
}

const TRIVIAL_TITLE_PATTERNS = [/^fix\(security\):/i, /^chore\(deps\):/i];

/** Count the number of changed lines (additions + deletions) in a diff. */
function countDiffLines(diff: string): number {
  return diff.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length;
}

/**
 * Returns false when the LLM evaluation step can safely be skipped.
 *
 * Conditions that skip evaluation:
 * 1. Diff is < 50 lines AND tests passed
 * 2. Commit title matches a dependency-bump pattern
 * 3. Every changed file is a test file (*.test.ts / *.spec.ts / *.test.js / *.spec.js)
 */
export function shouldEvaluate(diff: string, config: ShouldEvaluateConfig = {}): boolean {
  if (!diff.trim()) {
    // Empty diff — evaluateSuccess handles this case directly; don't skip
    return true;
  }

  // Condition 2: dependency bump by commit title
  const { commitTitle } = config;
  if (commitTitle && TRIVIAL_TITLE_PATTERNS.some((re) => re.test(commitTitle))) {
    return false;
  }

  // Condition 3: only test files changed
  const changedFiles = diff
    .split("\n")
    .filter((line) => line.startsWith("diff --git "))
    .map((line) => {
      // e.g. "diff --git a/src/foo.test.ts b/src/foo.test.ts"
      // Use string splitting instead of regex to avoid ReDoS on greedy `.+`
      const parts = line.split(" b/");
      return parts.length > 1 ? parts[parts.length - 1] : "";
    })
    .filter(Boolean);

  const TEST_FILE_RE = /\.(test|spec)\.[jt]sx?$/;
  if (changedFiles.length > 0 && changedFiles.every((f) => TEST_FILE_RE.test(f))) {
    return false;
  }

  // Condition 1: small diff AND tests passed
  if (config.testsPassed === true && countDiffLines(diff) < 50) {
    return false;
  }

  return true;
}

// ── Evaluation ──────────────────────────────────────────────────────

const EVALUATION_SCHEMA = {
  type: "object" as const,
  properties: {
    passed: {
      type: "boolean" as const,
      description: "Whether the diff adequately addresses the task",
    },
    confidence: {
      type: "number" as const,
      description: "Confidence in the evaluation (0.0 to 1.0)",
    },
    reasoning: {
      type: "string" as const,
      description: "Brief explanation of the evaluation",
    },
    issues: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Specific problems found, if any",
    },
  },
  required: ["passed", "confidence", "reasoning", "issues"] as const,
  additionalProperties: false as const,
};

/**
 * Extract acceptance criteria from an issue body.
 * Looks for "## Acceptance Criteria" section with checkbox items.
 */
export function extractAcceptanceCriteria(taskDescription: string): readonly string[] {
  const sectionBody = extractMarkdownSection(taskDescription, /^##\s*Acceptance\s*Criteria\s*$/i);
  if (!sectionBody) return [];

  return sectionBody
    .split("\n")
    .filter((line) => /^\s*-\s*\[[ x]\]/.test(line))
    .map((line) => line.replace(/^\s*-\s*\[[ x]\]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Extract file paths mentioned in the task description.
 * Looks for "## Files to Modify" section or inline backtick paths.
 */
export function extractExpectedFiles(taskDescription: string): readonly string[] {
  const sectionBody = extractMarkdownSection(
    taskDescription,
    /^##\s*Files\s*to\s*(?:Modify|Create)/i
  );
  if (!sectionBody) return [];

  return sectionBody
    .split("\n")
    .map((line) => {
      const match = line.match(/`([^`]+\.\w+)`/);
      return match ? match[1] : "";
    })
    .filter(Boolean);
}

function buildEvaluationPrompt(taskDescription: string, gitDiff: string): string {
  const truncatedDiff =
    gitDiff.length > MAX_DIFF_LENGTH
      ? gitDiff.slice(0, MAX_DIFF_LENGTH) + "\n\n... (diff truncated)"
      : gitDiff;

  const criteria = extractAcceptanceCriteria(taskDescription);
  const expectedFiles = extractExpectedFiles(taskDescription);

  const criteriaSection =
    criteria.length > 0
      ? [
          "",
          "## Acceptance Criteria (from the issue)",
          "Check each of these specifically against the diff:",
          ...criteria.map((c, i) => `${i + 1}. ${c}`),
          "",
          "If any acceptance criterion is NOT met by the diff, set passed=false and list the unmet criteria in issues.",
        ].join("\n")
      : "";

  const filesSection =
    expectedFiles.length > 0
      ? [
          "",
          "## Expected Files",
          "The task specified these files should be modified/created:",
          ...expectedFiles.map((f) => `- \`${f}\``),
          "",
          "Verify that the diff touches these files. If key files are missing from the diff, note it.",
        ].join("\n")
      : "";

  return [
    "You are evaluating whether a code change addresses a given task.",
    "Analyze the git diff and determine if it solves the stated task.",
    "",
    "## Task",
    taskDescription,
    "",
    "## Git Diff",
    "```diff",
    truncatedDiff,
    "```",
    criteriaSection,
    filesSection,
    "",
    "## General Evaluation Criteria",
    "- Does the diff make changes relevant to the task?",
    "- Are there obvious bugs or incomplete implementations?",
    "- Are there security issues introduced?",
    "- Is the scope appropriate (not too much, not too little)?",
    "",
    "Return your evaluation as JSON.",
  ].join("\n");
}

export async function getGitDiff(worktreePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "HEAD~1..HEAD"], {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return "";
  }
}

export async function evaluateSuccess(
  taskDescription: string,
  gitDiff: string,
  configOverrides?: Partial<EvaluationConfig>
): Promise<EvaluationResult> {
  if (!gitDiff.trim()) {
    return {
      passed: false,
      confidence: 1.0,
      reasoning: "No changes in diff — nothing to evaluate",
      issues: ["Empty diff"],
    };
  }

  const config = { ...DEFAULT_EVALUATION_CONFIG, ...configOverrides };

  try {
    const prompt = buildEvaluationPrompt(taskDescription, gitDiff);

    const conversation = query({
      prompt,
      options: {
        model: config.model,
        maxTurns: 1,
        maxBudgetUsd: config.maxBudgetUsd,
        permissionMode: "plan",
        systemPrompt: "You are a code review evaluator. Respond only with the requested JSON.",
        outputFormat: {
          type: "json_schema",
          schema: EVALUATION_SCHEMA,
        },
      },
    });

    let result: SDKResultMessage | null = null;
    for await (const message of conversation) {
      if (message.type === "result") {
        result = message as SDKResultMessage;
      }
    }

    if (!result || result.subtype !== "success") {
      return INCONCLUSIVE_RESULT;
    }

    const parsed = result.structured_output as
      | {
          passed: boolean;
          confidence: number;
          reasoning: string;
          issues: string[];
        }
      | undefined;

    if (!parsed || typeof parsed.passed !== "boolean") {
      return INCONCLUSIVE_RESULT;
    }

    return {
      passed: parsed.passed,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: parsed.reasoning ?? "",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    return INCONCLUSIVE_RESULT;
  }
}
