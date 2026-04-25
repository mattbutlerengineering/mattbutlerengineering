/**
 * Service worker utility functions for Rialto applications.
 */

/**
 * Unregisters any service workers that are NOT scoped to the specified paths.
 * Useful for cleaning up rogue service workers registered at higher scopes (e.g., /)
 * that might intercept traffic for other applications in a monorepo.
 *
 * @param exemptedScopes List of URL scope substrings that should NOT be unregistered.
 */
export function unregisterStaleServiceWorkers(exemptedScopes: string[] = ["/hospitality/"]): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      const isExempted = exemptedScopes.some((scope) => registration.scope.includes(scope));
      if (!isExempted) {
        console.info(`[rialto] Unregistering stale service worker at scope: ${registration.scope}`);
        void registration.unregister();
      }
    }
  });
}
