import type { Spec } from "@json-render/react";

/**
 * Compose the prompt sent to /api/gen/ui when refining an existing spec.
 *
 * Embeds the current spec as context so the model modifies it in place rather
 * than regenerating from scratch, and asks for the COMPLETE modified spec back.
 *
 * Pure (no React, no side effects) so it can be unit-tested in isolation.
 */
export function createRefinementPrompt(currentSpec: Spec, userInstruction: string): string {
  return (
    `Here is an existing UI spec generated from Rialto components. ` +
    `Please modify it according to the user's instruction. ` +
    `Output the COMPLETE modified spec (not just the changes).\n\n` +
    `Existing spec:\n${JSON.stringify(currentSpec)}\n\n` +
    `Modification requested: ${userInstruction}`
  );
}
