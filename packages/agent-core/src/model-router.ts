// ── Types ───────────────────────────────────────────────────────────

export type ModelTier = "haiku" | "sonnet" | "opus";

export interface IssueInput {
  readonly title: string;
  readonly labels: string[];
  readonly body: string;
}

export interface ModelRoutingResult {
  readonly tier: ModelTier;
  readonly modelId: string;
  readonly reason: string;
}

// ── Constants ───────────────────────────────────────────────────────

const MODEL_IDS: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
} as const;

/**
 * Title prefixes that indicate a lightweight, automatable change.
 * These match conventional-commits style prefixes for dependency bumps
 * and security-only patches.
 */
const HAIKU_TITLE_PATTERNS: readonly RegExp[] = [
  /^chore\(deps[\w-]*\):/i,
  /^fix\(security\):/i,
  /^chore\(deps\):/i,
];

/**
 * Keywords in the issue body or title that signal architectural complexity,
 * requiring deeper reasoning from Opus.
 */
const OPUS_COMPLEXITY_KEYWORDS: readonly RegExp[] = [
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

// ── Routing logic ────────────────────────────────────────────────────

/**
 * Determine the appropriate model tier for an issue based on its labels,
 * title, and body content.
 *
 * Priority order (first match wins):
 * 1. Dependency bumps / security-only fixes → haiku
 * 2. CI fixes → sonnet
 * 3. Features with architecture/complexity keywords → opus
 * 4. Feature label (simple scope) → sonnet
 * 5. Default → sonnet
 */
export function routeModel(issue: IssueInput): ModelTier {
  const { tier } = routeModelWithReason(issue);
  return tier;
}

/**
 * Same as `routeModel` but also returns the model ID and the reason
 * for the routing decision. Useful for logging and observability.
 */
export function routeModelWithReason(issue: IssueInput): ModelRoutingResult {
  const labels = issue.labels.map((l) => l.toLowerCase());
  const titleLower = issue.title.toLowerCase();
  const bodyLower = issue.body.toLowerCase();

  // 1. Dependency bumps and security-only fixes → haiku (~30s)
  for (const pattern of HAIKU_TITLE_PATTERNS) {
    if (pattern.test(issue.title)) {
      return buildResult("haiku", `Title matches lightweight pattern: ${pattern.source}`);
    }
  }

  // 2. CI fixes → sonnet (~2 min)
  if (labels.includes("ci-fix")) {
    return buildResult("sonnet", "Issue has ci-fix label");
  }

  // 3. Feature with architectural/complex keywords → opus (~5-10 min)
  if (labels.includes("feature")) {
    const combinedText = `${titleLower} ${bodyLower}`;
    for (const keyword of OPUS_COMPLEXITY_KEYWORDS) {
      if (keyword.test(combinedText)) {
        return buildResult("opus", `Feature with complexity keyword: ${keyword.source}`);
      }
    }

    // 4. Feature label but no complexity signals → sonnet (~3-5 min)
    return buildResult("sonnet", "Feature label with simple scope");
  }

  // 5. Default → sonnet
  return buildResult("sonnet", "Default routing: no specific pattern matched");
}

/**
 * Resolve a ModelTier to its concrete model ID string.
 */
export function resolveModelId(tier: ModelTier): string {
  return MODEL_IDS[tier];
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildResult(tier: ModelTier, reason: string): ModelRoutingResult {
  return { tier, modelId: MODEL_IDS[tier], reason };
}
