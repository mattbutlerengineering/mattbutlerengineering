import type { EvalReport } from "./types.js";

/** Confidence thresholds for bucketing self-evaluation confidence scores. */
const HIGH_THRESHOLD = 0.7;
const MEDIUM_THRESHOLD = 0.4;

/** Per-bucket calibration data: how many tasks fell in this bucket and their actual pass rate. */
export interface CalibrationBucket {
  /** Number of tasks in this confidence bucket (with self-evaluation). */
  readonly count: number;
  /** Fraction of tasks in this bucket that actually passed (ground-truth). 0 when count is 0. */
  readonly passRate: number;
}

/**
 * Calibration summary: bucketed accuracy of the agent's self-reported confidence
 * vs the harness ground-truth pass/fail outcome.
 *
 * Buckets:
 *   high:   confidence >= 0.7
 *   medium: 0.4 <= confidence < 0.7
 *   low:    confidence < 0.4
 */
export interface CalibrationSummary {
  readonly high: CalibrationBucket;
  readonly medium: CalibrationBucket;
  readonly low: CalibrationBucket;
  /** Tasks that had a selfEvaluation field. */
  readonly totalWithSelfEval: number;
  /** Tasks that had no selfEvaluation field (not counted in any bucket). */
  readonly totalWithoutSelfEval: number;
}

function bucket(count: number, passed: number): CalibrationBucket {
  return { count, passRate: count === 0 ? 0 : passed / count };
}

/**
 * Pure function — no I/O.
 *
 * Pairs each task's agent self-reported confidence with the harness ground-truth
 * pass/fail, and returns bucketed accuracy: how often high/med/low confidence
 * coincided with an actual pass.
 */
export function calibrate(report: EvalReport): CalibrationSummary {
  let highCount = 0;
  let highPassed = 0;
  let medCount = 0;
  let medPassed = 0;
  let lowCount = 0;
  let lowPassed = 0;
  let withSelfEval = 0;
  let withoutSelfEval = 0;

  for (const task of report.tasks) {
    if (task.selfEvaluation === undefined) {
      withoutSelfEval += 1;
      continue;
    }

    withSelfEval += 1;
    const { confidence } = task.selfEvaluation;
    const passed = task.passed ? 1 : 0;

    if (confidence >= HIGH_THRESHOLD) {
      highCount += 1;
      highPassed += passed;
    } else if (confidence >= MEDIUM_THRESHOLD) {
      medCount += 1;
      medPassed += passed;
    } else {
      lowCount += 1;
      lowPassed += passed;
    }
  }

  return {
    high: bucket(highCount, highPassed),
    medium: bucket(medCount, medPassed),
    low: bucket(lowCount, lowPassed),
    totalWithSelfEval: withSelfEval,
    totalWithoutSelfEval: withoutSelfEval,
  };
}
