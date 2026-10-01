/**
 * sentry-heartbeat-targets.mjs — what the daily Sentry heartbeat checks, and
 * which Sentry project each deployed artifact is expected to report to.
 *
 * One row per deployed artifact, not per project: `mattbutlerengineering` is
 * shared by marketing and rialto-web, and a per-project check would let a
 * still-reporting app hide a blind one. See
 * docs/features/sentry-silence-alert/architecture.md § Target registry.
 *
 * Frozen data: the runner reads it, nothing writes it.
 */

const API_BASE = "https://api.mattbutlerengineering.com";
const SITE_BASE = "https://mattbutlerengineering.com";

/**
 * @typedef {{ id: string, kind: "backend" | "browser", project: string, url: string, app?: string }} HeartbeatTarget
 */

/** @type {ReadonlyArray<Readonly<HeartbeatTarget>>} */
export const TARGETS = Object.freeze(
  [
    {
      id: "users-api",
      kind: "backend",
      project: "users-api",
      url: `${API_BASE}/api/v1/users/health`,
    },
    {
      id: "reservations-api",
      kind: "backend",
      project: "reservations-api",
      url: `${API_BASE}/api/v1/reservations/health`,
    },
    { id: "agent-api", kind: "backend", project: "agent-api", url: `${API_BASE}/api/gen/health` },
    // Public and unauthenticated — measured 2026-10-01 to load with no Auth0
    // redirect (breakdown item 1).
    {
      id: "hospitality",
      kind: "browser",
      project: "hospitality",
      url: `${SITE_BASE}/hospitality/reservations/manage`,
      app: "hospitality",
    },
    {
      id: "marketing",
      kind: "browser",
      project: "mattbutlerengineering",
      url: `${SITE_BASE}/`,
      app: "marketing",
    },
    {
      id: "rialto-web",
      kind: "browser",
      project: "mattbutlerengineering",
      url: `${SITE_BASE}/rialto/`,
      app: "rialto-web",
    },
  ].map((target) => Object.freeze(target))
);

/** The Sentry projects the heartbeat gives a verdict on, in registry order. */
export const IN_SCOPE_PROJECTS = Object.freeze([
  ...new Set(TARGETS.map((target) => target.project)),
]);
