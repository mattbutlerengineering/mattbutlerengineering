import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { resolveModelId } from "./model-registry.js";

// ── Types ───────────────────────────────────────────────────────────

export interface ReviewResult {
  readonly approved: boolean;
  readonly issues: readonly string[];
}

export interface ReviewConfig {
  readonly model: string;
  readonly maxBudgetUsd: number;
}

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  model: resolveModelId("haiku"),
  maxBudgetUsd: 0.05,
};

const APPROVED_RESULT: ReviewResult = {
  approved: true,
  issues: [],
};

const MAX_DIFF_LENGTH = 50_000;

// ── JSON Schema ──────────────────────────────────────────────────────

const REVIEW_SCHEMA = {
  type: "object" as const,
  properties: {
    approved: {
      type: "boolean" as const,
      description: "Whether the diff is safe to auto-merge (true = no blocking issues found)",
    },
    issues: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "List of blocking issues found, if any. Empty when approved is true.",
    },
  },
  required: ["approved", "issues"] as const,
  additionalProperties: false as const,
};

// ── Prompt ───────────────────────────────────────────────────────────

function buildReviewPrompt(diff: string): string {
  const truncatedDiff =
    diff.length > MAX_DIFF_LENGTH
      ? diff.slice(0, MAX_DIFF_LENGTH) + "\n\n... (diff truncated)"
      : diff;

  return [
    "You are a senior code reviewer performing a quick safety check before an auto-merge.",
    "Analyze the git diff for blocking issues across four categories.",
    "Be pragmatic — only flag real problems, not style preferences.",
    "",
    "## Git Diff",
    "```diff",
    truncatedDiff,
    "```",
    "",
    "## Review Categories",
    "",
    "### 1. Security",
    "- Hardcoded secrets, API keys, tokens, or passwords",
    "- SQL injection vulnerabilities (string concatenation in queries)",
    "- XSS vulnerabilities (unsanitized user input rendered as HTML)",
    "- Disabled authentication or authorization checks",
    "- Sensitive data logged or exposed in error messages",
    "",
    "### 2. Accessibility (a11y)",
    "- Interactive elements missing accessible labels (aria-label, aria-labelledby)",
    "- Images missing alt text",
    "- Form inputs missing associated labels",
    "- Focus management broken (e.g., modal traps removed)",
    "- Color contrast issues introduced via hardcoded style values",
    "",
    "### 3. Performance",
    "- Unbounded loops or O(n²) algorithms on large datasets",
    "- Missing pagination on database queries that could return large result sets",
    "- Large assets (images, videos) added without optimization",
    "- Synchronous blocking I/O in hot paths",
    "",
    "### 4. Hardcoded Values",
    "- Magic numbers or strings that should be named constants or config",
    "- Hardcoded URLs, ports, or environment-specific values",
    "- Hardcoded user IDs, tenant IDs, or other data that varies by environment",
    "",
    "## Instructions",
    "- Set `approved: true` only when no blocking issues are found",
    "- Set `approved: false` and list each issue concisely in `issues` when problems exist",
    "- Each issue string should identify the category and specific problem",
    "- Return your review as JSON.",
  ].join("\n");
}

// ── Core function ────────────────────────────────────────────────────

/**
 * Performs a lightweight AI code review on a git diff before auto-merging.
 *
 * Checks for: security issues, a11y problems, performance concerns, hardcoded values.
 * Uses Haiku by default for speed (~5s per review).
 *
 * Returns `{ approved: true, issues: [] }` when the diff is safe to merge,
 * or `{ approved: false, issues: [...] }` when blocking issues are found.
 * On LLM failure, returns approved=true (fail-open) to avoid blocking merges.
 */
export async function reviewDiff(
  diff: string,
  configOverrides?: Partial<ReviewConfig>
): Promise<ReviewResult> {
  if (!diff.trim()) {
    return {
      approved: false,
      issues: ["Empty diff — nothing to review"],
    };
  }

  const config = { ...DEFAULT_REVIEW_CONFIG, ...configOverrides };

  try {
    const prompt = buildReviewPrompt(diff);

    const conversation = query({
      prompt,
      options: {
        model: config.model,
        maxTurns: 1,
        maxBudgetUsd: config.maxBudgetUsd,
        permissionMode: "plan",
        systemPrompt: "You are a code reviewer. Respond only with the requested JSON.",
        outputFormat: {
          type: "json_schema",
          schema: REVIEW_SCHEMA,
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
      return APPROVED_RESULT;
    }

    const parsed = result.structured_output as
      | {
          approved: boolean;
          issues: string[];
        }
      | undefined;

    if (!parsed || typeof parsed.approved !== "boolean") {
      return APPROVED_RESULT;
    }

    return {
      approved: parsed.approved,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    return APPROVED_RESULT;
  }
}
