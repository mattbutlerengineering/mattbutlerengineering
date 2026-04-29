/**
 * Canonical ACMM type definitions (JSDoc — no runtime).
 *
 * Ported from kubestellar/console: web/src/lib/acmm/sources/types.ts
 *
 * @typedef {'acmm' | 'fullsend' | 'agentic-engineering-framework' | 'claude-reflect'} SourceId
 *
 * @typedef {'feedback-loop' | 'readiness' | 'autonomy' | 'observability' | 'governance' | 'self-tuning' | 'prerequisite' | 'learning' | 'traceability'} CriterionCategory
 *
 * @typedef {'learning' | 'traceability'} CrossCuttingDimension
 *
 * @typedef {Object} DetectionHint
 * @property {'path' | 'glob' | 'any-of'} type
 * @property {string | string[]} pattern
 *
 * @typedef {Object} Criterion
 * @property {string} id
 * @property {SourceId} source
 * @property {number} [level]    Maturity level (0 = prerequisite, 1–6 = maturity levels)
 * @property {CriterionCategory} category
 * @property {string} name
 * @property {string} description
 * @property {string} rationale
 * @property {string} [details]
 * @property {DetectionHint} detection
 * @property {string} [referencePath]
 * @property {string} [frequency]
 * @property {boolean} [scannable]
 * @property {CrossCuttingDimension} [crossCutting]
 *
 * @typedef {Object} LevelDef
 * @property {number} n
 * @property {string} name
 * @property {string} role
 * @property {string} characteristic
 * @property {string} transitionTrigger
 * @property {string} antiPattern
 *
 * @typedef {Object} Source
 * @property {SourceId} id
 * @property {string} name
 * @property {string} url
 * @property {string} citation
 * @property {boolean} definesLevels
 * @property {LevelDef[]} [levels]
 * @property {Criterion[]} criteria
 */

export {};
