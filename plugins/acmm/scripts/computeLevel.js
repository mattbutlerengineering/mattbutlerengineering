import { acmmSource } from "./sources/acmm.js";
import { SCANNABLE_IDS_BY_LEVEL, AGENT_INSTRUCTION_FILE_IDS } from "./scannableIdsByLevel.js";

const MIN_LEVEL = 1;
const MAX_LEVEL = 6;
/** Minimum fraction of scannable criteria at a level to consider it "passed" */
const LEVEL_COMPLETION_THRESHOLD = 0.7;
/** Level 0 = prerequisites (soft indicator, not gating) */
const PREREQUISITE_LEVEL = 0;

/**
 * Behavioral gates — each ties a runtime signal to a level advancement check.
 * When `strict` is true, a failing gate blocks level advancement (hard gate).
 * When `strict` is false (default), a failing gate emits a warning but allows advancement (soft gate).
 */
const BEHAVIORAL_GATES = [
  {
    level: 3,
    name: "ci-flake-rate",
    description: "CI flake rate must be below 20%",
    threshold: 0.2,
    direction: "below", // value must be below threshold to pass
    extract: (b) => b?.flake?.rate_30d,
  },
  {
    level: 4,
    name: "agent-pr-acceptance",
    description: "Agent PR acceptance rate must exceed 50%",
    threshold: 0.5,
    direction: "above", // value must be above threshold to pass
    extract: (b) => b?.agent_pr?.acceptance_rate_30d,
  },
  {
    level: 5,
    name: "auto-qa-tuning-history",
    description: "Auto-QA tuning history must have more than 1 entry",
    threshold: 1,
    direction: "above", // value must be above threshold to pass
    extract: (b) => b?.auto_qa_history_count,
  },
  {
    level: 6,
    name: "agent-pr-revert-rate",
    description: "Agent PR revert rate must be below 10%",
    threshold: 0.1,
    direction: "below", // value must be below threshold to pass
    extract: (b) => b?.agent_pr?.revert_rate_30d,
  },
  {
    level: 6,
    name: "human-touch-ratio",
    description:
      "Human-touch ratio must be below 50% (merged agent PRs requiring non-author commits, 30-day window)",
    threshold: 0.5,
    direction: "below", // value must be below threshold to pass
    extract: (b) => b?.agent_pr?.human_touch_ratio,
    /** When true, missing data blocks advancement (unverifiable) rather than silently passing. */
    unverifiableOnNoData: true,
  },
];

/**
 * Evaluate a single behavioral gate against the provided behavioral data.
 * Returns a gate result object with pass/fail status and metadata.
 *
 * For gates with `unverifiableOnNoData: true`, missing data reports
 * `unverifiable: true` and blocks advancement in strict mode.
 * For all other gates, missing data is treated as passed (no block).
 */
function evaluateGate(gate, behavioral, strict) {
  const value = gate.extract(behavioral);
  const hasValue = value !== undefined && value !== null;
  const unverifiable = !hasValue && gate.unverifiableOnNoData === true;

  let passed;
  if (!hasValue) {
    // unverifiableOnNoData=true → fails in strict mode; passes in soft mode
    passed = unverifiable ? !strict : true;
  } else {
    passed = gate.direction === "below" ? value < gate.threshold : value > gate.threshold;
  }

  return {
    level: gate.level,
    name: gate.name,
    description: gate.description,
    passed,
    value: hasValue ? value : null,
    threshold: gate.threshold,
    direction: gate.direction,
    strict,
    dataAvailable: hasValue,
    unverifiable,
  };
}

/** Virtual criterion representing the OR group above (not in acmm.ts source). */
const VIRTUAL_AGENT_INSTRUCTIONS = {
  id: "acmm:agent-instructions",
  source: "acmm",
  level: 2,
  category: "feedback-loop",
  name: "Agent instructions (any)",
  description: "Any one of CLAUDE.md, AGENTS.md, .github/copilot-instructions.md, or .cursorrules.",
  rationale:
    "Any vendor-neutral or vendor-specific instruction file satisfies the L2 Instructed signal.",
  detection: {
    type: "any-of",
    pattern: ["CLAUDE.md", "AGENTS.md", ".github/copilot-instructions.md", ".cursorrules"],
  },
};

const ACMM_CRITERIA = acmmSource.criteria.filter((c) => c.source === "acmm");
const ACMM_LEVELS = acmmSource.levels ?? [];

/** Return scannable criteria for a given level (non-scannable items are
 *  displayed in the UI but excluded from threshold calculations).
 *  For L2, the four individual instruction-file criteria are replaced by the
 *  virtual OR-group criterion so any one file satisfies the level gate.
 *
 *  The set of IDs is governed by SCANNABLE_IDS_BY_LEVEL (shared with the
 *  badge endpoint) to guarantee both compute identical levels. */
function scannableCriteriaForLevel(level) {
  const ids = SCANNABLE_IDS_BY_LEVEL[level];
  if (!ids) {
    // Levels not in the threshold walk (e.g. L0 prerequisites)
    return ACMM_CRITERIA.filter((c) => c.level === level && c.scannable !== false);
  }
  // Build Criterion objects: real criteria come from the catalog; the virtual
  // "acmm:agent-instructions" is synthesised above.
  const result = [];
  for (const id of ids) {
    if (id === "acmm:agent-instructions") {
      result.push(VIRTUAL_AGENT_INSTRUCTIONS);
    } else {
      const found = ACMM_CRITERIA.find((c) => c.id === id);
      if (found) result.push(found);
    }
  }
  return result;
}

/** Return ALL criteria for a given level (including non-scannable). */
function allCriteriaForLevel(level) {
  return ACMM_CRITERIA.filter((c) => c.level === level);
}

function levelDef(n) {
  return ACMM_LEVELS.find((l) => l.n === n);
}

export function computeLevel(rawDetectedIds, behavioral = {}, options = {}) {
  const strict = options.strict ?? false;

  // Synthesise the virtual L2 OR-group criterion before the level walk.
  // Callers must already exclude hollow criteria from rawDetectedIds — hollow
  // verdicts do not count (verdictCounts("hollow") === false, #2022).
  const detectedIds = new Set(rawDetectedIds);
  if ([...AGENT_INSTRUCTION_FILE_IDS].some((id) => detectedIds.has(id))) {
    detectedIds.add("acmm:agent-instructions");
  }

  const detectedByLevel = {};
  const requiredByLevel = {};

  // L2–L6 threshold walk (L0 prerequisites and L1 are not gated)
  for (let n = MIN_LEVEL + 1; n <= MAX_LEVEL; n++) {
    const required = scannableCriteriaForLevel(n);
    requiredByLevel[n] = required.length;
    detectedByLevel[n] = required.filter((c) => detectedIds.has(c.id)).length;
  }

  // Evaluate all behavioral gates up front
  const behavioralGates = BEHAVIORAL_GATES.map((gate) => evaluateGate(gate, behavioral, strict));
  // Index gate results by level for quick lookup
  const gateByLevel = {};
  for (const g of behavioralGates) {
    gateByLevel[g.level] = g;
  }

  let currentLevel = MIN_LEVEL;
  for (let n = MIN_LEVEL + 1; n <= MAX_LEVEL; n++) {
    const required = requiredByLevel[n];
    const detected = detectedByLevel[n];
    if (required === 0) continue;
    // L2 "Instructed" is reached with any single criterion; higher levels use 70%
    const threshold = n === 2 ? 1 / required : LEVEL_COMPLETION_THRESHOLD;
    const ratio = detected / required;
    if (ratio >= threshold) {
      // Check behavioral gate for this level (if one exists)
      const gate = gateByLevel[n];
      if (gate && !gate.passed && strict) {
        // Hard gate: block advancement
        break;
      }
      // Soft gate failure or no gate: advance
      currentLevel = n;
    } else {
      break;
    }
  }

  const nextLevel = currentLevel < MAX_LEVEL ? currentLevel + 1 : null;
  const missingForNextLevel = nextLevel
    ? scannableCriteriaForLevel(nextLevel).filter((c) => !detectedIds.has(c.id))
    : [];

  const current = levelDef(currentLevel);
  const next = nextLevel ? levelDef(nextLevel) : null;

  // Prerequisite soft indicator
  const prereqCriteria = scannableCriteriaForLevel(PREREQUISITE_LEVEL);
  const prereqMet = prereqCriteria.filter((c) => detectedIds.has(c.id)).length;

  // Cross-cutting dimension counts (only scannable items)
  const learningCriteria = ACMM_CRITERIA.filter(
    (c) => c.crossCutting === "learning" && c.scannable !== false
  );
  const traceabilityCriteria = ACMM_CRITERIA.filter(
    (c) => c.crossCutting === "traceability" && c.scannable !== false
  );

  return {
    level: currentLevel,
    strict,
    levelName: current?.name ?? `L${currentLevel}`,
    role: current?.role ?? "",
    characteristic: current?.characteristic ?? "",
    detectedByLevel,
    requiredByLevel,
    missingForNextLevel,
    nextTransitionTrigger: next?.transitionTrigger ?? null,
    antiPattern: current?.antiPattern ?? "",
    prerequisites: {
      met: prereqMet,
      total: prereqCriteria.length,
    },
    crossCutting: {
      learning: {
        met: learningCriteria.filter((c) => detectedIds.has(c.id)).length,
        total: learningCriteria.length,
      },
      traceability: {
        met: traceabilityCriteria.filter((c) => detectedIds.has(c.id)).length,
        total: traceabilityCriteria.length,
      },
    },
    behavioralGates,
  };
}

/** Return all criteria (including non-scannable) for UI display. */
export function getAllCriteria() {
  return ACMM_CRITERIA;
}

/** Return all criteria grouped by level. */
export function getCriteriaByLevel() {
  const byLevel = {};
  for (let n = PREREQUISITE_LEVEL; n <= MAX_LEVEL; n++) {
    byLevel[n] = allCriteriaForLevel(n);
  }
  return byLevel;
}

export { BEHAVIORAL_GATES, LEVEL_COMPLETION_THRESHOLD, MIN_LEVEL, MAX_LEVEL, PREREQUISITE_LEVEL };
