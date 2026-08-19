/**
 * Readiness tracker for service startup probes.
 *
 * Distinguishes "service is still booting" (503) from "service is ready
 * for traffic" (200). Each service registers named checks that must all
 * pass before the service is considered ready.
 *
 * Immutable design: every state transition returns a new snapshot object
 * rather than mutating internal state visible to callers.
 */

export interface ReadinessCheckResult {
  readonly name: string;
  readonly status: "ok" | "error";
  readonly message?: string;
}

export interface ReadinessSnapshot {
  readonly ready: boolean;
  readonly checks: readonly ReadinessCheckResult[];
  readonly timestamp: string;
}

export type ReadinessCheckFn = () => Promise<void>;

interface RegisteredCheck {
  readonly name: string;
  readonly check: ReadinessCheckFn;
}

export interface ReadinessTracker {
  /**
   * Register a named readiness check. The check function should throw
   * if the dependency is not ready.
   */
  readonly registerCheck: (name: string, check: ReadinessCheckFn) => void;

  /**
   * Run all registered checks and return an immutable snapshot.
   */
  readonly evaluate: () => Promise<ReadinessSnapshot>;
}

/**
 * Create a new readiness tracker instance.
 *
 * Usage:
 * ```ts
 * const readiness = createReadinessTracker();
 * readiness.registerCheck("database", async () => {
 *   await prisma.$queryRaw`SELECT 1`;
 * });
 * readiness.registerCheck("auth", async () => {
 *   // verify JWKS cache is warm
 * });
 *
 * const snapshot = await readiness.evaluate();
 * // snapshot.ready === true when all checks pass
 * ```
 */
export function createReadinessTracker(): ReadinessTracker {
  const checks: RegisteredCheck[] = [];

  const registerCheck = (name: string, check: ReadinessCheckFn): void => {
    checks.push({ name, check });
  };

  const evaluate = async (): Promise<ReadinessSnapshot> => {
    const results = await Promise.all(
      checks.map(async ({ name, check }): Promise<ReadinessCheckResult> => {
        try {
          await check();
          return { name, status: "ok" };
        } catch (error) {
          return {
            name,
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    const ready = results.length > 0 && results.every((r) => r.status === "ok");

    return {
      ready,
      checks: results,
      timestamp: new Date().toISOString(),
    };
  };

  return { registerCheck, evaluate };
}

const DEV_AUTH0_JWKS_URL = "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/.well-known/jwks.json";
const DEFAULT_JWKS_TIMEOUT_MS = 2000;
const AUTH0_UNCONFIGURED_MESSAGE =
  "Auth0 JWKS not configured: set AUTH_AUTHORITY (or AUTH0_JWKS_URL)";

/**
 * Builds the Auth0 JWKS URL from an `AUTH_AUTHORITY` origin.
 *
 * Returns `undefined` when the authority is absent/empty (matching the
 * fail-closed auth gate, which treats an empty value as "not configured").
 * A single trailing slash is stripped so the JWKS path is never doubled.
 *
 * This is the single home for the `AUTH_AUTHORITY` -> JWKS-URL contract,
 * co-located with {@link registerStandardChecks} (the runtime consumer).
 * `@mbe/service-bootstrap` re-exports this from `validate-startup-config.ts`
 * for its own boot-time validation and readiness wiring.
 */
export function buildJwksUrl(authority: string | undefined): string | undefined {
  if (!authority) {
    return undefined;
  }
  return `${authority.replace(/\/$/, "")}/.well-known/jwks.json`;
}

/**
 * Resolves the JWKS URL the `auth` readiness check should probe, in
 * precedence order: explicit `auth0Url` option, `AUTH0_JWKS_URL`, then the
 * authority the service actually validates tokens against (`AUTH_AUTHORITY`,
 * via {@link buildJwksUrl}).
 *
 * The hardcoded dev-tenant fallback is a local-development convenience only
 * and is refused in production — matching `resolveJwksUrl()` in
 * `@mbe/service-bootstrap`'s `health.ts` (#4195). Probing it there would
 * report on an endpoint the service does not authenticate against, silently
 * masking a missing `AUTH_AUTHORITY` behind a green readiness check. Returns
 * `null` in that case so the `auth` check fails loudly instead of fetching.
 */
function resolveAuth0Url(explicit: string | undefined): string | null {
  const configured =
    explicit ?? process.env.AUTH0_JWKS_URL ?? buildJwksUrl(process.env.AUTH_AUTHORITY);
  if (configured) {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? null : DEV_AUTH0_JWKS_URL;
}

/** Minimal Prisma client shape needed for the database readiness check. */
export interface PrismaLike {
  readonly $queryRaw: (strings: TemplateStringsArray) => Promise<unknown>;
}

export interface StandardChecksOptions {
  /** Prisma (or compatible) client used to ping the database. */
  readonly prisma: PrismaLike;
  /**
   * Auth0 JWKS endpoint URL. Falls back to `AUTH0_JWKS_URL`, then
   * `AUTH_AUTHORITY` (via {@link buildJwksUrl}), then a dev-tenant default —
   * the dev-tenant default is refused when `NODE_ENV=production` and the
   * `auth` check fails instead of probing it. See {@link registerStandardChecks}.
   */
  readonly auth0Url?: string;
  /** Timeout in ms for the JWKS fetch. Defaults to 2000. */
  readonly jwksTimeoutMs?: number;
  /**
   * Override the global fetch function — useful in tests to avoid real HTTP
   * requests without monkey-patching globals.
   */
  readonly fetchFn?: typeof fetch;
}

/**
 * Register the standard database + JWKS readiness checks onto an existing
 * ReadinessTracker. Call this once during service startup to avoid
 * duplicating the same ~20 lines across every service's ready.ts.
 *
 * ```ts
 * const readiness = createReadinessTracker();
 * registerStandardChecks(readiness, { prisma });
 * // add service-specific checks after
 * ```
 */
export function registerStandardChecks(
  tracker: ReadinessTracker,
  options: StandardChecksOptions
): void {
  const {
    prisma,
    auth0Url,
    jwksTimeoutMs = DEFAULT_JWKS_TIMEOUT_MS,
    fetchFn = (...args: Parameters<typeof fetch>) => fetch(...args),
  } = options;

  const resolvedAuth0Url = resolveAuth0Url(auth0Url);

  tracker.registerCheck("database", async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  tracker.registerCheck("auth", async () => {
    if (resolvedAuth0Url === null) {
      throw new Error(AUTH0_UNCONFIGURED_MESSAGE);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), jwksTimeoutMs);
    try {
      const response = await fetchFn(resolvedAuth0Url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`JWKS returned ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  });
}
