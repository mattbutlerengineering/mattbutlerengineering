import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "./app.js";

describe("App factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("builds and starts the app", async () => {
    const app = await buildApp({ logger: false });
    expect(app).toBeDefined();
    await app.close();
  });
});
