import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

// ── Context Bundles ──────────────────────────────────────────────────
const TASK_CONTEXT_PATTERNS: Record<string, string[]> = {
  dependency: [".agent/contexts/dependency-bump.md"],
  "type-safe": [".agent/contexts/type-safety.md"],
  deploy: [".agent/contexts/deploy-fixes.md"],
  security: [".agent/contexts/security-audit.md"],
  test: [".agent/contexts/testing-patterns.md"],
  audit: [".agent/contexts/security-audit.md"],
};

const TASK_KEYWORDS: Record<string, RegExp[]> = {
  dependency: [/depend/i, /bump/i, /update dep/i, /upgrade/i],
  "type-safe": [/type/i, /any/i, /typescript/i],
  deploy: [/deploy/i, /wrangler/i, /digitalocean/i, /doctl/i],
  security: [/security/i, /audit/i, /auth/i, /authorization/i],
  test: [/test/i, /vitest/i, /mock/i],
  audit: [/audit/i, /security/i],
};

function detectTaskContexts(taskDescription: string): string[] {
  const contexts: string[] = [];
  for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
    for (const keyword of keywords) {
      if (keyword.test(taskDescription)) {
        const contextFiles = TASK_CONTEXT_PATTERNS[taskType] ?? [];
        for (const file of contextFiles) {
          if (existsSync(file)) {
            contexts.push(file);
          }
        }
        break;
      }
    }
  }
  return contexts;
}

// ── Source File Resolution ──────────────────────────────────────────
// Extract file paths mentioned in the task description and resolve
// related files (test files, shared schemas, route handlers).

const FILE_PATH_PATTERN =
  /(?:^|\s|`)((?:apps|packages|services|tools|infrastructure)\/[^\s`'"]+\.\w+)/g;
const DIRECTORY_PATTERN = /(?:^|\s|`)((?:apps|packages|services|tools)\/[^\s`'"]+\/)/g;

/**
 * Extract file paths mentioned in a task description.
 * Also infers related files (e.g., if a route file is mentioned, include its test).
 */
export function resolveSourceFiles(taskDescription: string): readonly string[] {
  const files = new Set<string>();

  // Extract explicit file paths
  for (const match of taskDescription.matchAll(FILE_PATH_PATTERN)) {
    files.add(match[1]);
  }

  // Extract directory references and add key files
  for (const match of taskDescription.matchAll(DIRECTORY_PATTERN)) {
    const dir = match[1];
    // If a service or app directory is mentioned, add its CLAUDE.md
    if (dir.startsWith("services/") || dir.startsWith("apps/")) {
      files.add(`${dir}CLAUDE.md`);
    }
  }

  // For each source file, also include its test file
  const withTests = new Set(files);
  for (const file of files) {
    if (!file.includes(".test.") && !file.includes(".spec.")) {
      const testFile = file.replace(/\.(\w+)$/, ".test.$1");
      withTests.add(testFile);
    }
  }

  // Add task-specific context bundles
  const contexts = detectTaskContexts(taskDescription);
  for (const ctx of contexts) {
    withTests.add(ctx);
  }

  return [...withTests];
}

// ── Dynamic Budget ──────────────────────────────────────────────────
// Scale budget based on task complexity signals in the description.

interface BudgetConfig {
  readonly budgetUsd: number;
  readonly maxTurns: number;
  readonly reason: string;
}

const COMPLEXITY_SIGNALS = {
  simple: {
    patterns: [/lint/i, /typo/i, /rename/i, /bump/i, /update dep/i, /fix import/i],
    budget: { budgetUsd: 0.5, maxTurns: 30, reason: "simple fix" },
  },
  standard: {
    patterns: [/fix/i, /add test/i, /update/i, /refactor/i, /ci-fix/i],
    budget: { budgetUsd: 1.0, maxTurns: 50, reason: "standard task" },
  },
  complex: {
    patterns: [/feat/i, /implement/i, /design/i, /architect/i, /new service/i, /migration/i],
    budget: { budgetUsd: 2.0, maxTurns: 75, reason: "complex feature" },
  },
} as const;

/**
 * Determine budget based on task description complexity.
 * Returns higher budget for complex tasks, lower for simple fixes.
 */
export function resolveBudget(taskDescription: string): BudgetConfig {
  // Check complex first (most specific)
  for (const signal of COMPLEXITY_SIGNALS.complex.patterns) {
    if (signal.test(taskDescription)) return COMPLEXITY_SIGNALS.complex.budget;
  }

  // Check simple
  for (const signal of COMPLEXITY_SIGNALS.simple.patterns) {
    if (signal.test(taskDescription)) return COMPLEXITY_SIGNALS.simple.budget;
  }

  // Default to standard
  return COMPLEXITY_SIGNALS.standard.budget;
}

// ── Model Selection ─────────────────────────────────────────────────
// Choose the right model based on task type.

const MODEL_MAP = {
  simple: "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-6",
  complex: "claude-sonnet-4-6",
} as const;

/**
 * Select model based on task complexity.
 * Haiku for simple fixes (fast, cheap), Sonnet for everything else.
 */
export function resolveModel(taskDescription: string): string {
  for (const signal of COMPLEXITY_SIGNALS.simple.patterns) {
    if (signal.test(taskDescription)) return MODEL_MAP.simple;
  }
  for (const signal of COMPLEXITY_SIGNALS.complex.patterns) {
    if (signal.test(taskDescription)) return MODEL_MAP.complex;
  }
  return MODEL_MAP.standard;
}

// ── Example PR Context ──────────────────────────────────────────────
// Fetch recent successful PRs to show the agent what good output looks like.

interface PrExample {
  readonly title: string;
  readonly body: string;
  readonly filesChanged: number;
}

/**
 * Fetch the 3 most recent merged PRs to use as examples in the agent prompt.
 * Returns empty array on failure (non-critical).
 */
export async function fetchRecentPrExamples(
  repoPath: string,
  limit = 3
): Promise<readonly PrExample[]> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        String(limit),
        "--json",
        "title,body,files",
        "--jq",
        `.[] | {title, body: (.body | split("\n")[0:5] | join("\n")), filesChanged: (.files | length)}`,
      ],
      { cwd: repoPath, timeout: 10_000 }
    );

    const lines = stdout.trim().split("\n").filter(Boolean);
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as PrExample;
        } catch {
          return { title: "", body: "", filesChanged: 0 };
        }
      })
      .filter((pr) => pr.title.length > 0);
  } catch {
    return [];
  }
}

/**
 * Format PR examples for inclusion in the agent system prompt.
 */
export function formatPrExamples(examples: readonly PrExample[]): string {
  if (examples.length === 0) return "";

  const formatted = examples
    .map(
      (pr, i) => `### Example ${i + 1}: ${pr.title}\nFiles changed: ${pr.filesChanged}\n${pr.body}`
    )
    .join("\n\n");

  return ["", "", "## Recent Successful PRs (follow this style)", "", formatted].join("\n");
}
