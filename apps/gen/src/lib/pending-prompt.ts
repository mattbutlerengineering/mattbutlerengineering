/**
 * A refresh mid-generation drops the request: the prompt lives only in
 * PromptBar state and the spec is saved after the stream completes. Stash the
 * prompt so the next page load can put it back. The generation is not
 * restarted — that would spend another model call the user did not ask for.
 */

export const PENDING_PROMPT_KEY = "gen.pendingPrompt";

/** QuotaExceededError and SecurityError must not fail the generation itself. */
function continueWhenStorageFails(error: unknown): void {
  if (error instanceof Error) return;
  throw error;
}

const INTERRUPTED_NOTICE =
  "Generation was interrupted. Your prompt is restored — press Generate to try again.";

/** `undefined` means "not read yet". StrictMode runs the state initializer twice. */
let cached: string | null | undefined;

export function interruptedPromptNotice(): string {
  return INTERRUPTED_NOTICE;
}

export function rememberPendingPrompt(
  prompt: string,
  storage: Storage = window.sessionStorage
): void {
  try {
    storage.setItem(PENDING_PROMPT_KEY, prompt);
  } catch (error) {
    continueWhenStorageFails(error);
  }
}

export function clearPendingPrompt(storage: Storage = window.sessionStorage): void {
  try {
    storage.removeItem(PENDING_PROMPT_KEY);
  } catch (error) {
    continueWhenStorageFails(error);
  }
  cached = null;
}

/** Read (once) the prompt a refresh interrupted, or null. */
export function readInterruptedPrompt(storage: Storage = window.sessionStorage): string | null {
  if (cached !== undefined) return cached;
  try {
    const value = storage.getItem(PENDING_PROMPT_KEY);
    storage.removeItem(PENDING_PROMPT_KEY);
    cached = value && value.trim() !== "" ? value : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Test-only: drop the module cache so each case reads storage fresh. */
export function resetInterruptedPromptCache(): void {
  cached = undefined;
}
