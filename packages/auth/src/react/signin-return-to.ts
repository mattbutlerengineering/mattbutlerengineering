import { isSafeReturnTo } from "./return-to.js";

/**
 * The validated returnTo of the most recent sign-in callback, held at module
 * scope: the callback's `history.replaceState` URL cleanup would destroy any
 * URL-carried state, and the value only needs to live for the page lifetime.
 */
let lastSigninReturnTo: string | undefined;

/** Record the returnTo threaded out of a completed sign-in callback (AuthProvider only). */
export function rememberSigninReturnTo(returnTo: string | undefined): void {
  lastSigninReturnTo = returnTo;
}

/**
 * Where to land after sign-in completes — the app-relative path carried
 * through the OIDC `state` by `signIn({ returnTo })`, or `"/"` when none was
 * carried. The state is attacker-influenceable, so the value is re-validated
 * against open redirects on read. Non-clearing, so it is render-safe.
 */
export function signinReturnTo(): string {
  return isSafeReturnTo(lastSigninReturnTo) ? lastSigninReturnTo : "/";
}
