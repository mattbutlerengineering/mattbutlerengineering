/**
 * Demo route paths — single source of truth for links between demo pages.
 *
 * Demo pages are mounted under the `demos` segment of the `/rialto` basename
 * (see routes.tsx and main.tsx). Cross-links between demo pages MUST include
 * the `/demos` prefix; otherwise they hit the `*` catch-all route and redirect
 * to the overview instead of the intended demo page. Deriving link targets
 * from these constants keeps them in sync with the route table and prevents
 * that class of bug from recurring.
 */

/** Path segment (below the `/rialto` basename) that all demo pages sit under. */
export const DEMOS_BASE = "/demos";

/** Fully-qualified (basename-relative) paths for every demo cross-link target. */
export const DEMO_ROUTES = {
  signIn: `${DEMOS_BASE}/login`,
  signUp: `${DEMOS_BASE}/signup`,
  sessionExpired: `${DEMOS_BASE}/session-expired`,
  dashboard: `${DEMOS_BASE}/dashboard`,
  teamCreate: `${DEMOS_BASE}/teams/new`,
  layouts: `${DEMOS_BASE}/layouts`,
  telemetry: `${DEMOS_BASE}/telemetry`,
  authFlow: `${DEMOS_BASE}/auth-flow`,
  drivers: `${DEMOS_BASE}/drivers`,
  driverNew: `${DEMOS_BASE}/drivers/new`,
  driver: (id: string) => `${DEMOS_BASE}/drivers/${id}`,
  driverEdit: (id: string) => `${DEMOS_BASE}/drivers/${id}/edit`,
} as const;
