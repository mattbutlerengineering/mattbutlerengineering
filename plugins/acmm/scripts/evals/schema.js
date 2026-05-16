/**
 * Eval task fixture and result schemas.
 *
 * Tasks are committed JSON files under `scripts/acmm/evals/tasks/`.
 * Results are appended JSONL lines at `metrics/acmm-evals.jsonl`.
 *
 * @typedef {Object} Rubric
 * @property {string[]} mustPass            Verification gates that must all pass: "build" | "tests" | "lint" | "typecheck"
 * @property {number}   diffSizeMax         Max acceptable changed-line count (additions+deletions)
 * @property {string[]} mustTouch           Glob-light patterns (substring match) the diff must include
 * @property {string[]} [mustNotTouch]      Patterns the diff must NOT include
 * @property {string[]} [mustCall]          Tool names the agent MUST use during the session
 * @property {string[]} [mustNotCall]       Tool names the agent MUST NOT use during the session
 * @property {Record<string, number>} [weights]  Optional per-criterion weights (defaults below). Keys: completed, verification, diffSize, filePaths, toolCalls
 *
 * @typedef {Object} TaskFixture
 * @property {string}  id
 * @property {string}  prompt
 * @property {string}  model
 * @property {number}  maxBudgetUsd
 * @property {number}  maxTurns
 * @property {string}  [baseBranch]    default: "main"
 * @property {Rubric}  rubric
 *
 * @typedef {Object} ScoreBreakdown
 * @property {boolean} completed         Session reached terminal state (success or stuck=false)
 * @property {"pass"|"fail"|"skip"} verification
 * @property {number}  diffSize          Total changed lines
 * @property {boolean} diffSizeOk        diffSize <= rubric.diffSizeMax
 * @property {boolean} touchedRequired   All rubric.mustTouch matched
 * @property {boolean} avoidedForbidden  None of rubric.mustNotTouch matched
 * @property {boolean} calledRequired   All rubric.mustCall matched
 * @property {boolean} avoidedForbiddenCalls None of rubric.mustNotCall matched
 *
 * @typedef {Object} EvalResult
 * @property {string}  timestamp        ISO8601
 * @property {string}  taskId
 * @property {string}  model
 * @property {boolean} success          Overall pass: weighted score >= passThreshold
 * @property {number}  score            0..1
 * @property {ScoreBreakdown} breakdown
 * @property {number}  [costUsd]
 * @property {number}  [numTurns]
 * @property {number}  durationMs
 * @property {string}  [error]          Set if the run threw before scoring
 */

export const DEFAULT_WEIGHTS = Object.freeze({
  completed: 1.0,
  verification: 1.0,
  diffSize: 0.5,
  filePaths: 0.5,
  toolCalls: 0.5,
});

/** A run is a "pass" if its weighted score meets this threshold. */
export const PASS_THRESHOLD = 0.75;

/**
 * Validate a task fixture object. Throws on missing required fields.
 * Pure validation — no Zod dependency to keep `scripts/acmm/` zero-install.
 * @param {unknown} raw
 * @returns {TaskFixture}
 */
export function parseTask(raw) {
  if (!raw || typeof raw !== "object") throw new Error("task: not an object");
  const t = /** @type {Record<string, unknown>} */ (raw);
  const required = ["id", "prompt", "model", "maxBudgetUsd", "maxTurns", "rubric"];
  for (const k of required) {
    if (t[k] === undefined) throw new Error(`task: missing required field "${k}"`);
  }
  if (typeof t.id !== "string" || !t.id) throw new Error("task.id: must be non-empty string");
  if (typeof t.prompt !== "string" || !t.prompt)
    throw new Error("task.prompt: must be non-empty string");
  if (typeof t.model !== "string" || !t.model)
    throw new Error("task.model: must be non-empty string");
  if (typeof t.maxBudgetUsd !== "number" || t.maxBudgetUsd <= 0) {
    throw new Error("task.maxBudgetUsd: must be positive number");
  }
  if (typeof t.maxTurns !== "number" || t.maxTurns <= 0 || !Number.isInteger(t.maxTurns)) {
    throw new Error("task.maxTurns: must be positive integer");
  }

  const rubric = parseRubric(t.rubric);

  return {
    id: t.id,
    prompt: t.prompt,
    model: t.model,
    maxBudgetUsd: t.maxBudgetUsd,
    maxTurns: t.maxTurns,
    baseBranch: typeof t.baseBranch === "string" ? t.baseBranch : "main",
    rubric,
  };
}

/**
 * @param {unknown} raw
 * @returns {Rubric}
 */
function parseRubric(raw) {
  if (!raw || typeof raw !== "object") throw new Error("task.rubric: not an object");
  const r = /** @type {Record<string, unknown>} */ (raw);

  if (!Array.isArray(r.mustPass)) throw new Error("task.rubric.mustPass: must be array");
  for (const g of r.mustPass) {
    if (typeof g !== "string") throw new Error("task.rubric.mustPass: items must be strings");
    if (!["build", "tests", "lint", "typecheck"].includes(g)) {
      throw new Error(
        `task.rubric.mustPass: unknown gate "${g}" (allowed: build, tests, lint, typecheck)`
      );
    }
  }
  if (typeof r.diffSizeMax !== "number" || r.diffSizeMax < 0) {
    throw new Error("task.rubric.diffSizeMax: must be non-negative number");
  }
  if (!Array.isArray(r.mustTouch) || r.mustTouch.length === 0) {
    throw new Error("task.rubric.mustTouch: must be non-empty array");
  }
  for (const p of r.mustTouch) {
    if (typeof p !== "string") throw new Error("task.rubric.mustTouch: items must be strings");
  }
  if (r.mustNotTouch !== undefined) {
    if (!Array.isArray(r.mustNotTouch)) throw new Error("task.rubric.mustNotTouch: must be array");
    for (const p of r.mustNotTouch) {
      if (typeof p !== "string") throw new Error("task.rubric.mustNotTouch: items must be strings");
    }
  }

  return {
    mustPass: /** @type {string[]} */ (r.mustPass),
    diffSizeMax: r.diffSizeMax,
    mustTouch: /** @type {string[]} */ (r.mustTouch),
    mustNotTouch: Array.isArray(r.mustNotTouch) ? /** @type {string[]} */ (r.mustNotTouch) : [],
    mustCall: Array.isArray(r.mustCall) ? /** @type {string[]} */ (r.mustCall) : [],
    mustNotCall: Array.isArray(r.mustNotCall) ? /** @type {string[]} */ (r.mustNotCall) : [],
    weights:
      r.weights && typeof r.weights === "object"
        ? /** @type {Record<string, number>} */ (r.weights)
        : undefined,
  };
}
