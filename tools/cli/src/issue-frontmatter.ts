/**
 * Issue agent frontmatter (#2021).
 *
 * An issue body may carry a fenced ```yaml agent block declaring per-issue
 * overrides for `mbe agent run`. Parsing never throws: malformed input
 * degrades to null overrides plus warnings, so the issue-worker loop can
 * always fall back to the model router.
 */
import { load } from "js-yaml";
import { resolveModelId, type ModelTier } from "@mbe/agent-core";

export type AdapterType = "auto" | "claude" | "gemini" | "opencode";

export interface AgentOverrides {
  model?: ModelTier;
  budget?: number;
  maxTurns?: number;
  adapter?: AdapterType;
}

export interface ParseResult {
  overrides: AgentOverrides | null;
  warnings: string[];
}

const MODEL_TIERS: readonly string[] = ["haiku", "sonnet", "opus"];
const ADAPTERS: readonly string[] = ["auto", "claude", "gemini", "opencode"];
const KNOWN_KEYS: readonly string[] = ["model", "budget", "max_turns", "adapter"];
/** Safety ceiling: a typo'd budget must not exceed the daily spend limit. */
const MAX_BUDGET_USD = 5;

const AGENT_BLOCK = /```yaml agent[ \t]*\n([\s\S]*?)```/g;

export function parseAgentFrontmatter(issueBody: string): ParseResult {
  const matches = [...issueBody.matchAll(AGENT_BLOCK)];
  if (matches.length === 0) return { overrides: null, warnings: [] };

  const warnings: string[] =
    matches.length > 1 ? [`multiple agent blocks found; using the first of ${matches.length}`] : [];

  let raw: unknown;
  try {
    raw = load(matches[0][1]);
  } catch (err) {
    return {
      overrides: null,
      warnings: [...warnings, `malformed yaml in agent block: ${(err as Error).message}`],
    };
  }

  if (raw === null || raw === undefined) return { overrides: null, warnings };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      overrides: null,
      warnings: [...warnings, "agent block must be a yaml mapping of key: value pairs"],
    };
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  const fieldResults = entries.map(([key, value]) => validateField(key, value));
  const allWarnings = [...warnings, ...fieldResults.flatMap((r) => r.warnings)];
  const overrides = fieldResults.reduce<AgentOverrides>((acc, r) => ({ ...acc, ...r.fields }), {});

  return {
    overrides: Object.keys(overrides).length > 0 ? overrides : null,
    warnings: allWarnings,
  };
}

function validateField(
  key: string,
  value: unknown
): { fields: AgentOverrides; warnings: string[] } {
  switch (key) {
    case "model":
      if (typeof value === "string" && MODEL_TIERS.includes(value)) {
        return { fields: { model: value as ModelTier }, warnings: [] };
      }
      return {
        fields: {},
        warnings: [`invalid model "${String(value)}"; expected one of: ${MODEL_TIERS.join(", ")}`],
      };
    case "budget": {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return {
          fields: {},
          warnings: [`invalid budget "${String(value)}"; expected a positive number (USD)`],
        };
      }
      if (value > MAX_BUDGET_USD) {
        return {
          fields: { budget: MAX_BUDGET_USD },
          warnings: [`budget ${value} capped at ${MAX_BUDGET_USD} USD`],
        };
      }
      return { fields: { budget: value }, warnings: [] };
    }
    case "max_turns":
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        return {
          fields: {},
          warnings: [`invalid max_turns "${String(value)}"; expected a positive integer`],
        };
      }
      return { fields: { maxTurns: value }, warnings: [] };
    case "adapter":
      if (typeof value === "string" && ADAPTERS.includes(value)) {
        return { fields: { adapter: value as AdapterType }, warnings: [] };
      }
      return {
        fields: {},
        warnings: [`invalid adapter "${String(value)}"; expected one of: ${ADAPTERS.join(", ")}`],
      };
    default:
      return {
        fields: {},
        warnings: [`unknown key "${key}" ignored (known: ${KNOWN_KEYS.join(", ")})`],
      };
  }
}

/** Map validated overrides to `mbe agent run` CLI flags. */
export function flagsFromOverrides(overrides: AgentOverrides | null): string[] {
  if (overrides === null) return [];
  return [
    ...(overrides.model ? ["--model", resolveModelId(overrides.model)] : []),
    ...(overrides.budget !== undefined ? ["--max-budget", String(overrides.budget)] : []),
    ...(overrides.maxTurns !== undefined ? ["--max-turns", String(overrides.maxTurns)] : []),
    ...(overrides.adapter ? ["--adapter", overrides.adapter] : []),
  ];
}
