import { existsSync } from "node:fs";

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

/**
 * Pure function: returns candidate context-bundle file paths matched by keywords.
 * No filesystem access — caller decides whether paths exist.
 */
export function classifyTaskContexts(taskDescription: string): readonly string[] {
  const contexts = new Set<string>();
  for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
    for (const keyword of keywords) {
      if (keyword.test(taskDescription)) {
        const contextFiles = TASK_CONTEXT_PATTERNS[taskType] ?? [];
        for (const file of contextFiles) {
          contexts.add(file);
        }
        break;
      }
    }
  }
  return [...contexts];
}

function detectTaskContexts(taskDescription: string): string[] {
  return classifyTaskContexts(taskDescription).filter((file) => existsSync(file));
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
