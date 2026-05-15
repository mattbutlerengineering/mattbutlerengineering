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
