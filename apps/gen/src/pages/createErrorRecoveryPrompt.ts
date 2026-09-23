/**
 * Compose the prompt sent to /api/gen/ui when retrying a failed generation
 * with the error fed back to the model ("retry with error context").
 *
 * Reuses the same generation call as a fresh submit — this only changes the
 * prompt text, embedding the original prompt and the failure so the model
 * can self-correct instead of the user retyping from scratch.
 *
 * Pure (no React, no side effects) so it can be unit-tested in isolation.
 */
export function createErrorRecoveryPrompt(originalPrompt: string, errorMessage: string): string {
  return (
    `The previous attempt to generate a UI from this prompt failed. ` +
    `Please fix the issue and generate a valid, complete spec.\n\n` +
    `Original prompt: ${originalPrompt}\n\n` +
    `Error: ${errorMessage}`
  );
}
