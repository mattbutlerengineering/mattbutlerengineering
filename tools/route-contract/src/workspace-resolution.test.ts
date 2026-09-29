/**
 * Settles, once, how this package reaches the four route owners and the client
 * it drives. Every other module here imports through these exact specifiers.
 *
 * Two facts make them non-obvious, and both were measured rather than assumed:
 *
 * 1. `@mbe/api-client`'s `exports["."]` resolves `default` to `./dist/index.js`
 *    (only `types` points at source), so the driver runs the BUILT client.
 *    turbo's `test` / `test:coverage` tasks both declare `dependsOn: ["^build"]`,
 *    so the dist is fresh in CI — but a bare `pnpm --dir tools/route-contract
 *    test` after editing the client needs `pnpm --dir packages/api-client build`
 *    first, or it grades a stale artifact.
 * 2. `@mbe/reservations-service`, `@mbe/users-service`, `@mbe/agent-service`
 *    and `@mbe/edge-worker` declare NO `exports` and NO `main`, so they do not
 *    resolve by bare package name at all. A package with no `exports` map does
 *    permit arbitrary deep subpath imports, which is how
 *    `apps/rialto-web/e2e/csp.spec.ts` already reaches `@mbe/edge-worker/csp.js`.
 *    The services' sources are `.ts`; vite maps the `.js` specifier onto them,
 *    which is why the harness is vitest and not a standalone node script.
 */
import { describe, it, expect } from "vitest";

import { createApiClient, AgentSessionClient } from "@mbe/api-client";
import edgeRouter from "@mbe/edge-worker/edge-router.js";
import { buildApp as buildReservationsApp } from "@mbe/reservations-service/src/app.js";
import { buildApp as buildUsersApp } from "@mbe/users-service/src/app.js";
import { buildApp as buildAgentApp } from "@mbe/agent-service/src/app.js";

describe("workspace resolution", () => {
  it("reaches the api-client factory and the non-factory AgentSessionClient", () => {
    expect(typeof createApiClient).toBe("function");
    expect(typeof AgentSessionClient).toBe("function");
  });

  it("reaches the edge Worker module's fetch entrypoint", () => {
    expect(typeof edgeRouter.fetch).toBe("function");
  });

  it("reaches each Fastify service's buildApp", () => {
    expect(typeof buildReservationsApp).toBe("function");
    expect(typeof buildUsersApp).toBe("function");
    expect(typeof buildAgentApp).toBe("function");
  });
});
