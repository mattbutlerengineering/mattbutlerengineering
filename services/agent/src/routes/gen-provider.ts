import { anthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Which vendor serves the gen routes (gen-ui, gen-agent), chosen per deployment by the
 * `GEN_PROVIDER` env var. Anthropic is the measured production pick (#6948);
 * `google` runs the same routes on a Google AI Studio key, whose free tier
 * bills nothing while no billing account is linked to the project.
 */
export const GEN_PROVIDER_IDS = ["anthropic", "google"] as const;
export type GenProviderId = (typeof GEN_PROVIDER_IDS)[number];

/**
 * Parses `GEN_PROVIDER`. Unset or blank keeps Anthropic; an unknown value
 * throws so a typo fails the deploy instead of silently billing the wrong vendor.
 */
export function resolveGenProvider(raw: string | undefined): GenProviderId {
  const value = raw?.trim().toLowerCase() ?? "";
  if (value === "") return "anthropic";
  const match = GEN_PROVIDER_IDS.find((id) => id === value);
  if (!match) {
    throw new Error(
      `Unknown GEN_PROVIDER "${raw}" (expected one of: ${GEN_PROVIDER_IDS.join(", ")})`
    );
  }
  return match;
}

/**
 * The AI SDK model for a provider. The Google key is read from `GEMINI_API_KEY`,
 * the same name the bake-off harness uses, so the repo has one name for it.
 * A missing key fails the first model call with the SDK's own error, as a
 * missing `ANTHROPIC_API_KEY` does.
 */
export function genLanguageModel(provider: GenProviderId, modelId: string): LanguageModel {
  if (provider === "google") {
    return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })(modelId);
  }
  return anthropic(modelId);
}

/** Per-provider `streamText` options. */
export function genProviderOptions(provider: GenProviderId) {
  // Gemini: send no thinking config. An explicit "low" level cost 2.6x the
  // output tokens of the default and scored worse (2026-10-22 bake-off).
  if (provider === "google") return undefined;
  return {
    anthropic: {
      // Haiku 5.5 thinks before the tool call, and those tokens count
      // against the output cap. Nothing is emitted until thinking
      // finishes, so a large form sits silent until the gateway 504s.
      thinking: { type: "disabled" as const },
      toolStreaming: true,
    },
  };
}
