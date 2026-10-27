/**
 * The IdP consent page stays in the joint session history after a successful
 * sign-in. `replaceState` on the callback only strips the OIDC query; the
 * browser Back button then lands on the expired Auth0 `/u/consent` URL (400).
 *
 * Before `signIn`, record `history.length`. On the callback, if the round-trip
 * pushed more than the callback entry itself, `history.go` back across those
 * entries immediately. The user is already stored, so the restored page loads
 * signed in. Calling `history.go` from a `popstate` handler — even on a
 * timeout — is ignored by real browsers, so a sentinel the user must Back
 * through stops on `/u/consent`. A bfcache restore of the pre-auth page
 * reloads so a logged-out React tree is not shown over a live session.
 */

export const PRE_AUTH_HISTORY_KEY = "mbe.auth.preHistoryLength";
export const AUTH_BACK_RELOAD_KEY = "mbe.auth.backReload";

/** QuotaExceededError and SecurityError must not block sign-in. */
function continueWhenStorageFails(error: unknown): void {
  if (error instanceof Error) return;
  throw error;
}

/**
 * How many history entries Back should skip from the callback document.
 * `added <= 1` means the IdP did not leave an entry of its own.
 */
export function authHistorySkipSteps(preLength: number, currentLength: number): number | null {
  if (!Number.isInteger(preLength) || !Number.isInteger(currentLength)) return null;
  if (preLength < 1 || currentLength < preLength) return null;
  const added = currentLength - preLength;
  return added > 1 ? added : null;
}

export function rememberPreAuthHistoryLength(storage: Storage = window.sessionStorage): void {
  try {
    storage.setItem(PRE_AUTH_HISTORY_KEY, String(window.history.length));
  } catch (error) {
    continueWhenStorageFails(error);
  }
}

export function installAuthBackSkip(
  history: History = window.history,
  storage: Storage = window.sessionStorage
): void {
  let raw: string | null;
  try {
    raw = storage.getItem(PRE_AUTH_HISTORY_KEY);
    storage.removeItem(PRE_AUTH_HISTORY_KEY);
  } catch {
    return;
  }
  if (raw == null) return;
  const steps = authHistorySkipSteps(Number(raw), history.length);
  if (steps == null) return;

  try {
    storage.setItem(AUTH_BACK_RELOAD_KEY, "1");
  } catch (error) {
    continueWhenStorageFails(error);
  }
  // Not from popstate: browsers drop history.go that runs inside that event.
  history.go(-steps);
}

interface PageShowTarget {
  sessionStorage: Storage;
  location: { reload: () => void };
  addEventListener: (type: "pageshow", listener: (event: PageTransitionEvent) => void) => void;
  removeEventListener: (type: "pageshow", listener: (event: PageTransitionEvent) => void) => void;
}

/** Reload a bfcache restore that followed an auth-history skip. Returns cleanup. */
export function installAuthBackReload(target: PageShowTarget = window): () => void {
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    try {
      const flagged = target.sessionStorage.getItem(AUTH_BACK_RELOAD_KEY) === "1";
      if (!flagged) return;
      target.sessionStorage.removeItem(AUTH_BACK_RELOAD_KEY);
      target.location.reload();
    } catch (error) {
      continueWhenStorageFails(error);
    }
  };
  target.addEventListener("pageshow", onPageShow);
  return () => target.removeEventListener("pageshow", onPageShow);
}
