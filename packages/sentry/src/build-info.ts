/** Marker used when no build identity is available — never a fake version. */
export const UNKNOWN_BUILD = "unknown";

export interface BuildInfo {
  readonly sha: string;
  /** The single "which build is this" string: Sentry release, OTel service.version, /health version. */
  readonly version: string;
}

/**
 * The one owner of build identity. DEPLOY_SHA is injected into every service
 * container by deploy-services.yml; absent (local dev, tests) resolves to
 * UNKNOWN_BUILD so an unattributed build is visible rather than disguised.
 * Pure and dependency-free so browser bundles can import it without
 * pulling in the OTel SDK (this module is part of the browser-safe
 * `@mbe/sentry/react` graph).
 */
export function resolveBuildInfo(env: Readonly<Record<string, string | undefined>>): BuildInfo {
  const sha = env.DEPLOY_SHA?.trim() || UNKNOWN_BUILD;
  return { sha, version: sha };
}
