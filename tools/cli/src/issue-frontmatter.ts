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
  /** Tier to retry at when the initial run fails. One escalation max. */
  escalate?: ModelTier;
  verify?: string;
}

export interface ParseResult {
  overrides: AgentOverrides | null;
  warnings: string[];
}

const MODEL_TIERS: readonly string[] = ["haiku", "sonnet", "opus"];
const ADAPTERS: readonly string[] = ["auto", "claude", "gemini", "opencode"];
const KNOWN_KEYS: readonly string[] = ["model", "budget", "max_turns", "adapter", "escalate", "verify"];
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

type FieldResult = { fields: AgentOverrides; warnings: string[] };

const invalid = (warning: string): FieldResult => ({ fields: {}, warnings: [warning] });

function validateModel(value: unknown): FieldResult {
  if (typeof value === "string" && MODEL_TIERS.includes(value)) {
    return { fields: { model: value as ModelTier }, warnings: [] };
  }
  return invalid(`invalid model "${String(value)}"; expected one of: ${MODEL_TIERS.join(", ")}`);
}

function validateBudget(value: unknown): FieldResult {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return invalid(`invalid budget "${String(value)}"; expected a positive number (USD)`);
  }
  if (value > MAX_BUDGET_USD) {
    return {
      fields: { budget: MAX_BUDGET_USD },
      warnings: [`budget ${value} capped at ${MAX_BUDGET_USD} USD`],
    };
  }
  return { fields: { budget: value }, warnings: [] };
}

function validateMaxTurns(value: unknown): FieldResult {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return invalid(`invalid max_turns "${String(value)}"; expected a positive integer`);
  }
  return { fields: { maxTurns: value }, warnings: [] };
}

function validateAdapter(value: unknown): FieldResult {
  if (typeof value === "string" && ADAPTERS.includes(value)) {
    return { fields: { adapter: value as AdapterType }, warnings: [] };
  }
  return invalid(`invalid adapter "${String(value)}"; expected one of: ${ADAPTERS.join(", ")}`);
}

function validateEscalate(value: unknown): FieldResult {
  if (typeof value === "string" && MODEL_TIERS.includes(value)) {
    return { fields: { escalate: value as ModelTier }, warnings: [] };
  }
  return invalid(`invalid escalate "${String(value)}"; expected one of: ${MODEL_TIERS.join(", ")}`);
}

function validateVerify(value: unknown): FieldResult {
  if (typeof value === "string" && value.length > 0) {
    return { fields: { verify: value }, warnings: [] };
  }
  return invalid(`invalid verify "${String(value)}"; expected a non-empty shell command string`);
}

function validateField(key: string, value: unknown): FieldResult {
  switch (key) {
    case "model":
      return validateModel(value);
    case "budget":
      return validateBudget(value);
    case "max_turns":
      return validateMaxTurns(value);
    case "adapter":
      return validateAdapter(value);
    case "escalate":
      return validateEscalate(value);
    case "verify":
      return validateVerify(value);
    default:
      return invalid(`unknown key "${key}" ignored (known: ${KNOWN_KEYS.join(", ")})`);
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
