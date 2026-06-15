import type { ModelTier } from "./model-router.js";

// ── Canonical model ID table ─────────────────────────────────────────
//
// A model-ID bump is a one-file change: update the entry below and every
// caller that imports resolveModelId() picks up the new value automatically.

export const MODEL_IDS: Readonly<Record<ModelTier, string>> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
};

// ── Tier downgrade chain (used by feedback loop) ─────────────────────
//
// Fix sessions are tightly scoped so they run one tier below the parent.

export const TIER_DOWNGRADE: Readonly<Record<ModelTier, ModelTier>> = {
  opus: "sonnet",
  sonnet: "haiku",
  haiku: "haiku",
};

// ── Public API ───────────────────────────────────────────────────────

/**
 * Resolve a ModelTier to its concrete model ID string.
 */
export function resolveModelId(tier: ModelTier): string {
  return MODEL_IDS[tier];
}

/**
 * Return the model ID to use for a feedback-loop fix session.
 * Fix sessions run one tier below the parent:
 * opus → sonnet, sonnet → haiku, haiku → haiku.
 */
export function getFeedbackLoopModel(parentModelId: string): string {
  const entry = (Object.entries(MODEL_IDS) as [ModelTier, string][]).find(
    ([, id]) => id === parentModelId
  );
  if (!entry) return parentModelId;
  return MODEL_IDS[TIER_DOWNGRADE[entry[0]]];
}
