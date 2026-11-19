import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { summarize, type SummaryInput } from "./not-run.js";

/** Prints the suite summary with NOT RUN as its own line, never folded into passed. */
export default class ConformanceReporter implements Reporter {
  private readonly results: SummaryInput[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    this.results.push({
      title: test.title,
      status: result.status,
      annotations: test.annotations,
    });
  }

  onEnd(): void {
    const s = summarize(this.results);
    console.info("\nCONFORMANCE SUMMARY");
    console.info(`  PASSED:  ${s.passed}`);
    console.info(`  FAILED:  ${s.failed}`);
    console.info(`  NOT RUN: ${s.notRun.length}`);
    for (const n of s.notRun) console.info(`    NOT RUN  ${n.title}: ${n.reason}`);
    for (const t of s.unexplainedSkips)
      console.info(`    SKIPPED WITHOUT REASON (not a pass)  ${t}`);
  }
}
