import type { TestInfo } from "@playwright/test";

export const NOT_RUN_ANNOTATION = "NOT RUN";

export interface SummaryInput {
  readonly title: string;
  readonly status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  readonly annotations: ReadonlyArray<{ type: string; description?: string }>;
}

export interface Summary {
  readonly passed: number;
  readonly failed: number;
  readonly notRun: ReadonlyArray<{ title: string; reason: string }>;
  readonly unexplainedSkips: ReadonlyArray<string>;
}

export function notRunReason(annotations: SummaryInput["annotations"]): string | null {
  const found = annotations.find((a) => a.type === NOT_RUN_ANNOTATION);
  if (!found) return null;
  return found.description?.trim() || "no reason given";
}

/** Folds results into the suite summary. NOT RUN never counts as passed. */
export function summarize(results: ReadonlyArray<SummaryInput>): Summary {
  let passed = 0;
  let failed = 0;
  const notRun: Array<{ title: string; reason: string }> = [];
  const unexplainedSkips: string[] = [];
  for (const r of results) {
    const reason = notRunReason(r.annotations);
    if (reason !== null) {
      notRun.push({ title: r.title, reason });
    } else if (r.status === "passed") {
      passed++;
    } else if (r.status === "skipped") {
      unexplainedSkips.push(r.title);
    } else {
      failed++;
    }
  }
  return { passed, failed, notRun, unexplainedSkips };
}

/**
 * Marks the running test NOT RUN and stops it. The test shows as skipped, never passed,
 * and the reporter lists it with its reason in the suite summary.
 */
export function declareNotRun(testInfo: TestInfo, reason: string): void {
  testInfo.annotations.push({ type: NOT_RUN_ANNOTATION, description: reason });
  console.info(`RESULT ${testInfo.title} | NOT RUN | ${reason}`);
  testInfo.skip(true, `NOT RUN: ${reason}`);
}
