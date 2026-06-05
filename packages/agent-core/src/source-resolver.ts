import { existsSync } from "node:fs";
import { classifyTask } from "./task-signal-registry.js";

/**
 * Pure function: returns candidate context-bundle file paths for a task.
 * Delegates keyword classification to the shared TaskSignalRegistry.
 * No filesystem access — caller decides whether paths exist.
 */
export function classifyTaskContexts(taskDescription: string): readonly string[] {
  return classifyTask(taskDescription).contextBundles;
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
