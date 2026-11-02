/**
 * Minimal vitest reporter for scripts/storybook-test-gate.mjs (#8088).
 *
 * The quarantine makes vitest's exit code always 1, and the json reporter
 * records neither unhandled errors nor how the run ended, so a story that
 * throws from a timer would otherwise leave the gate green. This writes both
 * to the file named by STORYBOOK_GATE_RUN_FILE for the gate to read.
 */

import { writeFileSync } from "node:fs";

export default class StorybookGateReporter {
  onTestRunEnd(_testModules, unhandledErrors, reason) {
    const file = process.env.STORYBOOK_GATE_RUN_FILE;
    if (!file) return;
    const summary = {
      reason,
      unhandledErrors: unhandledErrors.map(({ name, message }) => ({ name, message })),
    };
    writeFileSync(file, JSON.stringify(summary));
  }
}
