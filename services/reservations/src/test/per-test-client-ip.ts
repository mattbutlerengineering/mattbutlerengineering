import type { FastifyInstance } from "fastify";

/**
 * Lets one Fastify app be shared by every test in a file (built in `beforeAll`)
 * without the global `@fastify/rate-limit` bucket (100/min per IP, stored per
 * app instance) filling up across tests.
 *
 * `app.inject` is wrapped so each request carries the `remoteAddress` of the
 * current test; call the returned `nextTest()` from `beforeEach` to move to a
 * fresh address, which is a fresh bucket, exactly as a fresh app would give.
 * An explicit `remoteAddress` on a request still wins.
 */
export function perTestClientIp(app: FastifyInstance): { nextTest: () => void } {
  let counter = 0;
  let current = "10.0.0.1";
  const originalInject = app.inject.bind(app) as (opts: unknown) => unknown;

  const nextTest = (): void => {
    counter += 1;
    // 10.<hi>.<lo>.1 covers 65k tests, far more than any one file holds.
    current = `10.${Math.floor(counter / 256) % 256}.${counter % 256}.1`;
  };

  const wrapped = (...args: unknown[]): unknown => {
    const [first] = args;
    if (first !== null && typeof first === "object") {
      return originalInject({ remoteAddress: current, ...first });
    }
    return originalInject(first);
  };
  (app as unknown as { inject: unknown }).inject = wrapped;

  nextTest();
  return { nextTest };
}
