import { vi } from "vitest";

// Global mock for @mbe/sentry/node
vi.mock("@mbe/sentry/node", () => ({
  sentryFastifyPlugin: vi.fn(),
}));
