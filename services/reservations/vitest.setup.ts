import { vi } from "vitest";
import type * as FastifyModule from "fastify";

// Global mock for @mbe/sentry/node
vi.mock("@mbe/sentry/node", () => ({
  sentryFastifyPlugin: vi.fn(),
  captureRequestError: vi.fn(),
}));

// Compile each route schema once per worker instead of once per buildApp()
// (see src/test/shared-schema-compilers.ts for the profile behind this).
vi.mock("fastify", async (importOriginal) => {
  const actual = await importOriginal<typeof FastifyModule>();
  const { withSharedSchemaCompilers } = await import("./src/test/shared-schema-compilers.js");
  const shared = Object.assign(
    (opts?: Parameters<typeof actual.default>[0]) =>
      actual.default(withSharedSchemaCompilers(opts)),
    actual.default
  );
  return { ...actual, default: shared, fastify: shared };
});
