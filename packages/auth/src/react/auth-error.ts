/**
 * Classifies react-oidc-context errors by the operation that produced them.
 *
 * react-oidc-context tags every error it dispatches with a `source`
 * (`ErrorContext`). Failures of *silent* operations — the proactive refresh
 * (`signinSilent`), oidc-client-ts's automatic renew (`renewSilent`), and
 * silent sign-out — happen in the background while the user is still
 * authenticated and working. They must never be presented as "sign-in
 * failed": the session is still live until the token actually expires.
 *
 * Interactive failures (`signinCallback`, `signinRedirect`, …) are the ones a
 * sign-in error screen is for.
 */
export const SILENT_AUTH_ERROR_SOURCES = ["signinSilent", "renewSilent", "signoutSilent"] as const;

const SILENT_SOURCES: ReadonlySet<string> = new Set(SILENT_AUTH_ERROR_SOURCES);

/** True when `error` came from a background (silent) auth operation. */
export function isSilentAuthError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const source = (error as { source?: unknown }).source;
  return typeof source === "string" && SILENT_SOURCES.has(source);
}
