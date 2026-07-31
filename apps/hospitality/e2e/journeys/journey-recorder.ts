import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import { redactSecrets } from "../../../../scripts/venue-journey/report.mjs";

export type JourneyStepStatus = "passed" | "failed" | "skipped";

export interface JourneyStepResult {
  name: string;
  status: JourneyStepStatus;
  durationMs: number;
  error?: string;
  /** Visible `[role="alert"]` text when the step failed — see capturePageError. */
  pageError?: string;
}

export interface JourneyReport {
  runId: string;
  runUrl: string;
  startedAt: string;
  venueName: string;
  steps: JourneyStepResult[];
  consoleErrors: string[];
}

/** Where the report + failure screenshots land (already gitignored). */
const ARTIFACT_DIR = "e2e/test-results";
const REPORT_PATH = join(ARTIFACT_DIR, "journey-report.json");

/**
 * Budget for reading the error banner. The config's 15 s `actionTimeout` would
 * apply otherwise, and this runs on a path that has already failed — a
 * best-effort read must not stretch the run.
 */
const ALERT_READ_TIMEOUT_MS = 2_000;

/**
 * Best-effort read of the app's own error banner at the moment a step failed.
 *
 * A Playwright locator timeout names the element that never appeared, not why —
 * the visible `[role="alert"]` usually carries the real cause (e.g. "403 Admin
 * role required"). Redacted at capture: this is untrusted page text on its way
 * to a public issue body and to the run's JSON artifact.
 *
 * Never throws. A closed page, a navigated-away DOM, or no alert at all records
 * nothing and leaves the original step failure exactly as it was.
 */
async function capturePageError(page: Page): Promise<string | undefined> {
  try {
    const alert = page.locator('[role="alert"]:visible').first();
    if ((await alert.count()) === 0) return undefined;
    const text = await alert.innerText({ timeout: ALERT_READ_TIMEOUT_MS });
    return redactSecrets(text).trim() || undefined;
  } catch {
    return undefined;
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Identifies the run in issue bodies and links back to its artifacts. */
export function resolveRunContext(): { runId: string; runUrl: string } {
  const runId = process.env["GITHUB_RUN_ID"] ?? `local-${Date.now()}`;
  const server = process.env["GITHUB_SERVER_URL"] ?? "https://github.com";
  const repo = process.env["GITHUB_REPOSITORY"];
  return { runId, runUrl: repo ? `${server}/${repo}/actions/runs/${runId}` : "(local run)" };
}

/**
 * Records the journey step-by-step so the workflow can report timings, hard
 * failures, and soft friction from one JSON artifact.
 *
 * Steps do NOT throw on failure: once a step fails the remaining journey steps
 * are recorded as `skipped` and control falls through to cleanup, so a broken
 * onboarding wizard never leaves a synthetic venue behind in prod. The spec
 * calls `assertGreen()` at the very end to fail the Playwright test.
 */
export function createJourneyRecorder(page: Page, venueName: string) {
  const steps: JourneyStepResult[] = [];
  const consoleErrors: string[] = [];
  const { runId, runUrl } = resolveRunContext();
  const startedAt = new Date().toISOString();

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const hasFailed = () => steps.some((step) => step.status === "failed");

  async function runTimed(name: string, fn: () => Promise<void>): Promise<void> {
    const startedMs = Date.now();
    try {
      await fn();
      steps.push({ name, status: "passed", durationMs: Date.now() - startedMs });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const pageError = await capturePageError(page);
      steps.push({
        name,
        status: "failed",
        durationMs: Date.now() - startedMs,
        error,
        ...(pageError ? { pageError } : {}),
      });
      await page
        .screenshot({ path: join(ARTIFACT_DIR, `journey-${slugify(name)}.png`), fullPage: true })
        .catch(() => undefined);
    }
  }

  return {
    /** Runs a journey step, or records it as skipped once the journey broke. */
    async step(name: string, fn: () => Promise<void>): Promise<void> {
      if (hasFailed()) {
        steps.push({ name, status: "skipped", durationMs: 0 });
        return;
      }
      await runTimed(name, fn);
    },

    /** Runs a step even after a failure — used for cleanup, which must happen. */
    async cleanupStep(name: string, fn: () => Promise<void>): Promise<void> {
      await runTimed(name, fn);
    },

    /** Adds a note that is friction, not failure (e.g. an undeletable leftover). */
    note(message: string): void {
      consoleErrors.push(message);
    },

    report(): JourneyReport {
      return { runId, runUrl, startedAt, venueName, steps: [...steps], consoleErrors };
    },

    write(): void {
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(REPORT_PATH, `${JSON.stringify(this.report(), null, 2)}\n`);
    },

    /** Fails the Playwright test when any step failed. */
    assertGreen(): void {
      const failed = steps.find((step) => step.status === "failed");
      if (failed) throw new Error(`Journey failed at "${failed.name}": ${failed.error}`);
    },
  };
}
