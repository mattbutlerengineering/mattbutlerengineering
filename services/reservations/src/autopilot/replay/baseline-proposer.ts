import type { Proposer } from "./types.js";

/** Baseline: never suggests anything. Perfect on a quiet night, zero recall elsewhere. */
export const neverSuggests: Proposer = {
  name: "never-suggests",
  propose: () => [],
};
