// ── Task Signal Registry ─────────────────────────────────────────────
//
// Single source of truth for "what kind of work is this?" — answers the
// question that budget-calculator, model-router, and source-resolver each
// used to answer with their own independent keyword/regex tables.
//
// `classifyTask` is a pure function (no I/O): given a task description and an
// optional title prefix, it returns the complexity tier, the matched task
// domains, and the context-bundle file paths those domains imply.
//
// This is a behavior-preserving SUPERSET of the four legacy tables:
//   - budget-calculator COMPLEXITY_SIGNALS  → `tier`
//   - model-router OPUS_COMPLEXITY_KEYWORDS  → `tier` ("complex")
//   - model-router HAIKU_TITLE_PATTERNS      → `tier` ("trivial") + `domains`
//   - source-resolver TASK_KEYWORDS/PATTERNS → `domains` + `contextBundles`

// ── Types ────────────────────────────────────────────────────────────

export type TaskTier = "trivial" | "simple" | "standard" | "complex";

export type TaskDomain = "dependency" | "test" | "security" | "deploy" | "feature" | "docs" | "ci";

export interface TaskSignals {
  readonly tier: TaskTier;
  readonly domains: readonly TaskDomain[];
  readonly contextBundles: readonly string[];
}

// ── Tier patterns ────────────────────────────────────────────────────
//
// Priority: complex > simple > standard (matches budget-calculator's
// classifyTaskComplexity ordering exactly). `trivial` is reserved for the
// title-prefix lightweight signals (model-router HAIKU_TITLE_PATTERNS).

const COMPLEX_PATTERNS: readonly RegExp[] = [
  // budget-calculator COMPLEXITY_SIGNALS.complex
  /feat/i,
  /implement/i,
  /design/i,
  /architect/i,
  /new service/i,
  /migration/i,
  // model-router OPUS_COMPLEXITY_KEYWORDS (architecture-grade reasoning)
  /\barchitect(ure|ural)?\b/i,
  /\brefactor\b/i,
  /\bdesign system\b/i,
  /\bmigrat(e|ion)\b/i,
  /\binfrastructure\b/i,
  /\bbreaking change\b/i,
  /\bapi design\b/i,
  /\bsystem design\b/i,
  /\bschema change\b/i,
  /\bmulti.?service\b/i,
  /\bcross.?cutting\b/i,
];

const SIMPLE_PATTERNS: readonly RegExp[] = [
  // budget-calculator COMPLEXITY_SIGNALS.simple
  /lint/i,
  /typo/i,
  /rename/i,
  /bump/i,
  /update dep/i,
  /fix import/i,
];

// ── Title-prefix lightweight signals (model-router HAIKU_TITLE_PATTERNS) ──
//
// A matching title prefix marks the task as `trivial` and, where the prefix
// implies a domain, contributes that domain.

interface TitleSignal {
  readonly pattern: RegExp;
  readonly domain?: TaskDomain;
}

const TITLE_SIGNALS: readonly TitleSignal[] = [
  { pattern: /^chore\(deps[\w-]*\):/i, domain: "dependency" },
  { pattern: /^chore\(deps\):/i, domain: "dependency" },
  { pattern: /^fix\(security\):/i, domain: "security" },
  { pattern: /^docs:/i, domain: "docs" },
  { pattern: /^test:/i, domain: "test" },
  { pattern: /^chore\(lint\):/i },
  { pattern: /^chore\(style\):/i },
];

// ── Domain rules ─────────────────────────────────────────────────────
//
// Each rule maps keyword patterns → a task domain and the context bundles
// that domain implies. Preserves source-resolver's TASK_KEYWORDS /
// TASK_CONTEXT_PATTERNS exactly (the legacy `audit` task folds into the
// `security` domain since both emitted security-audit.md).

interface DomainRule {
  readonly domain: TaskDomain;
  readonly patterns: readonly RegExp[];
  readonly bundles: readonly string[];
}

const DOMAIN_RULES: readonly DomainRule[] = [
  {
    domain: "dependency",
    patterns: [/depend/i, /bump/i, /update dep/i, /upgrade/i],
    bundles: [".agent/contexts/dependency-bump.md"],
  },
  {
    domain: "deploy",
    patterns: [/deploy/i, /wrangler/i, /digitalocean/i, /doctl/i],
    bundles: [".agent/contexts/deploy-fixes.md"],
  },
  {
    domain: "security",
    // legacy `security` keywords + legacy `audit` keywords (both → security-audit.md)
    patterns: [/security/i, /audit/i, /auth/i, /authorization/i],
    bundles: [".agent/contexts/security-audit.md"],
  },
  {
    domain: "test",
    patterns: [/test/i, /vitest/i, /mock/i],
    bundles: [".agent/contexts/testing-patterns.md"],
  },
];

// Type-safety bundle: legacy source-resolver `type-safe` task. Not a public
// TaskDomain (only contributes a context bundle), preserved verbatim.
const TYPE_SAFETY_PATTERNS: readonly RegExp[] = [/type/i, /any/i, /typescript/i];
const TYPE_SAFETY_BUNDLE = ".agent/contexts/type-safety.md";

// ── Classification ───────────────────────────────────────────────────

/**
 * Classify a task from its description and optional title prefix.
 *
 * - `tier`: trivial (title prefix) > complex > simple > standard.
 * - `domains`: every domain whose keyword set matches, plus any domain
 *   implied by a matching title prefix.
 * - `contextBundles`: the unique bundle paths implied by matched domains
 *   plus the type-safety bundle.
 *
 * Pure: no filesystem or network access.
 */
export function classifyTask(description: string, titlePrefix?: string): TaskSignals {
  const titleSignal = titlePrefix ? matchTitleSignal(titlePrefix) : undefined;

  const domains = new Set<TaskDomain>();
  const bundles = new Set<string>();

  for (const rule of DOMAIN_RULES) {
    if (rule.patterns.some((p) => p.test(description))) {
      domains.add(rule.domain);
      for (const bundle of rule.bundles) bundles.add(bundle);
    }
  }
  if (TYPE_SAFETY_PATTERNS.some((p) => p.test(description))) {
    bundles.add(TYPE_SAFETY_BUNDLE);
  }
  if (titleSignal?.domain) domains.add(titleSignal.domain);

  const tier: TaskTier = titleSignal ? "trivial" : classifyTier(description);

  return Object.freeze({
    tier,
    domains: Object.freeze([...domains]),
    contextBundles: Object.freeze([...bundles]),
  });
}

function matchTitleSignal(titlePrefix: string): TitleSignal | undefined {
  return TITLE_SIGNALS.find((s) => s.pattern.test(titlePrefix));
}

function classifyTier(description: string): Exclude<TaskTier, "trivial"> {
  if (COMPLEX_PATTERNS.some((p) => p.test(description))) return "complex";
  if (SIMPLE_PATTERNS.some((p) => p.test(description))) return "simple";
  return "standard";
}
