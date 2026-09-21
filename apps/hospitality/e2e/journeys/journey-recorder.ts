import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import {
  classifyJourneyStepOutcome,
  redactSecrets,
} from "../../../../scripts/venue-journey/report.mjs";

/**
 * `blocked` is a step that could not run because a credential it requires is
 * unset — distinct from `failed` (it ran and broke) and from `skipped` (the
 * journey had already broken upstream). See `classifyJourneyStepOutcome`.
 */
export type JourneyStepStatus = "passed" | "failed" | "blocked" | "skipped";

export interface JourneyStepResult {
  name: string;
  status: JourneyStepStatus;
  durationMs: number;
  error?: string;
  /** Visible `[role="alert"]` text when the step failed — see capturePageError. */
  pageError?: string;
  /** On a `blocked` step: the env vars that were unset. */
  missingCredentials?: string[];
}

/** Credentials a step cannot run without, and where to read them from. */
export interface JourneyStepRequirements {
  requiredEnv?: string[];
  env?: Record<string, string | undefined>;
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
 * Assumes at most one alert is *relevant* at a time: `.first()` takes the
 * leading match in DOM order and every other one is dropped. That holds for the
 * journey as written — the wizard mounts a single step at a time and Step 5
 * renders exactly one `[role="alert"]` — but a step that can show several at
 * once (OperatingHoursStep mounts up to three validation alerts) would report
 * only the leading one. Revisit the narrowing before pointing the journey at
 * such a step; a wrong-alert capture misdirects triage worse than none.
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

  /**
   * Thin wrapper over `classifyJourneyStepOutcome`, which owns every
   * passed/failed/blocked decision. Consulted twice, and both calls are the
   * same question asked at the two moments it can be answered: may this body
   * run at all, and — once it has — how did it end.
   */
  async function runTimed(
    name: string,
    fn: () => Promise<void>,
    { requiredEnv, env }: JourneyStepRequirements = {}
  ): Promise<void> {
    const gate = classifyJourneyStepOutcome({ requiredEnv, env });
    if (gate.state === "blocked") {
      steps.push({
        name,
        status: "blocked",
        durationMs: 0,
        error: gate.reason,
        missingCredentials: gate.missingCredentials,
      });
      return;
    }

    const startedMs = Date.now();
    try {
      await fn();
      steps.push({ name, status: "passed", durationMs: Date.now() - startedMs });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      // Same classifier, its second question: the body ran, so how did it end?
      const outcome = classifyJourneyStepOutcome({ error });
      const pageError = await capturePageError(page);
      steps.push({
        name,
        status: outcome.state,
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
    /**
     * Runs a journey step, or records it as skipped once the journey broke.
     *
     * `requirements.requiredEnv` names credentials the step cannot run
     * without: when any is unset the body is never invoked and the step is
     * recorded `blocked` rather than `failed` (#4527).
     */
    async step(
      name: string,
      fn: () => Promise<void>,
      requirements?: JourneyStepRequirements
    ): Promise<void> {
      if (hasFailed()) {
        steps.push({ name, status: "skipped", durationMs: 0 });
        return;
      }
      await runTimed(name, fn, requirements);
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

    /**
     * Fails the Playwright test when any step failed — or was blocked.
     *
     * A blocked step fails the journey CLOSED: it was never verified, so the
     * run cannot be called green. The point of the separate state is that the
     * verdict is legible (blocked on a named, unset credential, not a product
     * regression), never that the check is weaker.
     */
    assertGreen(): void {
      const failed = steps.find((step) => step.status === "failed");
      if (failed) throw new Error(`Journey failed at "${failed.name}": ${failed.error}`);

      const blocked = steps.find((step) => step.status === "blocked");
      if (blocked) throw new Error(`Journey blocked at "${blocked.name}": ${blocked.error}`);
    },
  };
}
