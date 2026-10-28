/**
 * The IdP consent page stays in the joint session history after a successful
 * sign-in. `replaceState` on the callback only strips the OIDC query; the
 * browser Back button then lands on the expired Auth0 `/u/consent` URL (400).
 *
 * Before `signIn`, record `history.length`. On the callback, if the round-trip
 * pushed more than the callback entry itself, push a same-document sentinel.
 * The next Back pops that sentinel and `history.go` skips the IdP entries,
 * landing on the page that started sign-in. A bfcache restore of that page
 * reloads so a logged-out React tree is not shown over a live session.
 */

export const PRE_AUTH_HISTORY_KEY = "mbe.auth.preHistoryLength";
export const AUTH_BACK_RELOAD_KEY = "mbe.auth.backReload";

/** `history.go` during `popstate` is ignored; run it on the next turn. */
const SKIP_IDP_HISTORY_DELAY_MS = 0;

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
  storage: Storage = window.sessionStorage,
  schedule: (fn: () => void) => void = (fn) => {
    window.setTimeout(fn, SKIP_IDP_HISTORY_DELAY_MS);
  }
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

  history.pushState({ mbeAuthSentinel: true }, "", window.location.href);
  // In-app navigation after this point pushes entries and grows the length.
  const armedLength = history.length;

  const onPop = (event: PopStateEvent) => {
    if (history.length !== armedLength) {
      // The user navigated in-app: Back no longer means "leave the callback".
      window.removeEventListener("popstate", onPop);
      return;
    }
    // Landing on the sentinel itself is not leaving the callback entry.
    const state: unknown = event.state;
    if (typeof state === "object" && state !== null && "mbeAuthSentinel" in state) return;
    window.removeEventListener("popstate", onPop);
    try {
      storage.setItem(AUTH_BACK_RELOAD_KEY, "1");
    } catch (error) {
      continueWhenStorageFails(error);
    }
    // history.go inside the popstate handler is ignored by some browsers.
    schedule(() => {
      history.go(-steps);
    });
  };
  window.addEventListener("popstate", onPop);
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
    try {
      const flagged = target.sessionStorage.getItem(AUTH_BACK_RELOAD_KEY) === "1";
      if (!flagged) return;
      target.sessionStorage.removeItem(AUTH_BACK_RELOAD_KEY);
      // A fresh load (not a bfcache restore) already has a live React tree.
      if (event.persisted) target.location.reload();
    } catch (error) {
      continueWhenStorageFails(error);
    }
  };
  target.addEventListener("pageshow", onPageShow);
  return () => target.removeEventListener("pageshow", onPageShow);
}
