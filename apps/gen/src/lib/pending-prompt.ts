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
/** The prompt of the generation that has not finished. Survives a refresh abort. */
let activePrompt: string | null = null;
/**
 * Set from pagehide/beforeunload, which fire before the browser aborts the
 * in-flight fetch. The abort's error path must not erase the stash.
 */
let leaving = false;

function rewriteActivePrompt(storage: Storage): void {
  if (!activePrompt) return;
  try {
    storage.setItem(PENDING_PROMPT_KEY, activePrompt);
  } catch (error) {
    continueWhenStorageFails(error);
  }
}

function markLeaving(): void {
  leaving = true;
  rewriteActivePrompt(window.sessionStorage);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", markLeaving);
  window.addEventListener("beforeunload", markLeaving);
}

export function interruptedPromptNotice(): string {
  return INTERRUPTED_NOTICE;
}

export function rememberPendingPrompt(
  prompt: string,
  storage: Storage = window.sessionStorage
): void {
  activePrompt = prompt;
  leaving = false;
  try {
    storage.setItem(PENDING_PROMPT_KEY, prompt);
  } catch (error) {
    continueWhenStorageFails(error);
  }
}

export function clearPendingPrompt(storage: Storage = window.sessionStorage): void {
  // A refresh aborts the fetch after pagehide. Completing or failing in that
  // window must leave the prompt for the next load.
  if (leaving) {
    rewriteActivePrompt(storage);
    return;
  }
  activePrompt = null;
  cached = null;
  try {
    storage.removeItem(PENDING_PROMPT_KEY);
  } catch (error) {
    continueWhenStorageFails(error);
  }
}

/**
 * Read the prompt a refresh interrupted, or null.
 * The key stays until the generation finishes: deleting it on read drops the
 * prompt when auth redirects before the playground commits.
 */
export function readInterruptedPrompt(storage: Storage = window.sessionStorage): string | null {
  if (cached !== undefined) return cached;
  try {
    const value = storage.getItem(PENDING_PROMPT_KEY);
    cached = value && value.trim() !== "" ? value : null;
  } catch {
    cached = null;
  }
  activePrompt = cached;
  return cached;
}

/** Test-only: drop the module cache so each case reads storage fresh. */
export function resetInterruptedPromptCache(): void {
  cached = undefined;
  activePrompt = null;
  leaving = false;
}
