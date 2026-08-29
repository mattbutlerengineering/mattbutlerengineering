/**
 * Tiny module-level store for the post-sign-in destination.
 *
 * The auth provider's `onSigninCallback` fires before the /callback route
 * renders, and its URL cleanup (`history.replaceState`) would destroy any
 * URL-carried state — so the value is held here for `CallbackRedirect` to
 * read. A module variable (not sessionStorage) is the simplest store that
 * survives that replaceState; it is naturally scoped to the page lifetime.
 */

let storedReturnTo: string | undefined;

/** Remember the validated returnTo path threaded out of the sign-in callback. */
export function rememberReturnTo(returnTo?: string): void {
  storedReturnTo = returnTo;
}

/**
 * Read the remembered returnTo path. Deliberately non-clearing so it is safe
 * to call during render (StrictMode renders twice).
 */
export function readReturnTo(): string | undefined {
  return storedReturnTo;
}
