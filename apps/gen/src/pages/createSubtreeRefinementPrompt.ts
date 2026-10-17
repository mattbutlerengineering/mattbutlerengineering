import type { Spec } from "@json-render/react";

/**
 * Compose the prompt sent to /api/gen/ui when refining ONE node of a spec.
 *
 * Sibling of `createRefinementPrompt`: instead of the whole spec it embeds just
 * the selected subtree plus its ancestry, and asks for ONLY the replacement
 * subtree back with the root key unchanged so it can be spliced in.
 *
 * Pure (no React, no side effects) so it can be unit-tested in isolation.
 */
export function createSubtreeRefinementPrompt(
  subtree: Spec,
  ancestors: { key: string; type: string }[],
  userInstruction: string
): string {
  return (
    `Here is one selected subtree of an existing UI spec generated from Rialto components. ` +
    `Please modify it according to the user's instruction. ` +
    `Output ONLY the replacement subtree, not the rest of the spec, and keep its root key ` +
    `${JSON.stringify(subtree.root)} unchanged.\n\n` +
    `Selected subtree:\n${JSON.stringify(subtree)}\n\n` +
    `Ancestors (root to parent):\n${JSON.stringify(ancestors)}\n\n` +
    `Modification requested: ${userInstruction}`
  );
}
