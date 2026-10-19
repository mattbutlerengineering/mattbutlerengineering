import type { PrismaLike } from "@mbe/database";
import { AUTH0_UNCONFIGURED_MESSAGE, probeJwks, resolveJwksUrl } from "./auth0-jwks.js";

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

const DEFAULT_JWKS_TIMEOUT_MS = 2000;
const TRANSIENT_RETRY_DELAY_MS = 50;

/**
 * Retries a flaky external-dependency probe once after a short delay before
 * giving up. A readiness check runs on every scrape (unlike a boot-time
 * check), so a single transient blip — a dropped connection, a slow DNS
 * lookup — must not flip `/ready` to 503 on its own; a real outage still
 * fails both attempts and reports not-ready (#5534).
 */
async function withTransientRetry<T>(probe: () => Promise<T>): Promise<T> {
  try {
    return await probe();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
    return probe();
  }
}

export interface StandardChecksOptions {
  /** Prisma (or compatible) client used to ping the database. */
  readonly prisma: Pick<PrismaLike, "$queryRaw">;
  /**
   * Auth0 JWKS endpoint URL. Falls back to `AUTH0_JWKS_URL`, then
   * `AUTH_AUTHORITY` (via {@link resolveJwksUrl}), then a dev-tenant default —
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
  const { prisma, auth0Url, jwksTimeoutMs = DEFAULT_JWKS_TIMEOUT_MS, fetchFn } = options;

  const resolvedAuth0Url = resolveJwksUrl(auth0Url);

  tracker.registerCheck("database", () =>
    withTransientRetry(async () => {
      await prisma.$queryRaw`SELECT 1`;
    })
  );

  tracker.registerCheck("auth", async () => {
    if (resolvedAuth0Url === null) {
      throw new Error(AUTH0_UNCONFIGURED_MESSAGE);
    }
    await withTransientRetry(async () => {
      const result = await probeJwks(resolvedAuth0Url, { timeoutMs: jwksTimeoutMs, fetchFn });
      if (result.kind === "http") {
        throw new Error(`JWKS returned ${result.status}`);
      }
      if (result.kind === "timeout" || result.kind === "network") {
        throw result.error;
      }
    });
  });
}
