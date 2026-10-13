/**
 * Per-issue queue telemetry writer.
 *
 * Appends one row per worker completion to the queue-telemetry metric.
 * Outcome fields (merged/merged_at/ci_first_pass/rework_cycles) may be null
 * at write time — the sensor reconciles them from GitHub in a later pass.
 *
 * The writer, row key, merge and sink path live in `queue-telemetry-store.mjs`
 * (#6381); this module stays as the stable import path used by the queue
 * profile's telemetry hook and the ACMM human-touch report.
 *
 * Row schema:
 *   issue_number    number        GitHub issue number
 *   labels          string[]      Labels at time of claim
 *   model_tier      string        haiku | sonnet | opus
 *   subagent_tokens number        Tokens from worker <usage> payload
 *   tool_uses       number        Tool call count for the session
 *   duration_ms     number        Wall-clock ms from claim to completion
 *   pr_number       number|null   PR created (null if worker failed)
 *   merged          boolean|null  Reconciled by sensor
 *   ci_first_pass   boolean|null  Reconciled by sensor
 *   rework_cycles   number|null   Reconciled by sensor
 *   reviewer_verdict string|null  pass | flag | skipped | error
 *                                 error = the reviewer could not run (dispatch
 *                                 threw / timed out). Distinct from pass: the
 *                                 merge gate never fired. Read by
 *                                 collect-queue-efficiency's review_coverage.
 *   claimed_at      string        ISO 8601
 *   merged_at       string|null   ISO 8601, reconciled by sensor
 *   cost_usd        number|null   Optional precise cost if known at write time
 *   human_touch_reason string|undefined  One of HUMAN_TOUCH_REASONS.
 *                                 Optional — classifies why a merged agent PR
 *                                 needed a human commit. Absent on rows
 *                                 written before this field existed, and on
 *                                 rows where no human touch occurred.
 *
 * Security: only the schema fields above are permitted. Unknown fields
 * (which could carry credentials) cause a throw before any write.
 */

export { appendTelemetryRow, HUMAN_TOUCH_REASONS } from "./queue-telemetry-store.mjs";
