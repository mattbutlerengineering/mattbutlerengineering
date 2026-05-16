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

  it("builds the app with default CORS origins", async () => {
    const app = await buildApp({ logger: false });
    expect(app).toBeDefined();
    await app.close();
  });

  it("accepts valid CORS origins from env", async () => {
    process.env.CORS_ORIGINS = "https://custom.mattbutlerengineering.com, http://localhost:3000";
    process.env.NODE_ENV = "development";
    
    const app = await buildApp({ logger: false });
    expect(app).toBeDefined();
    await app.close();
  });

  it("warns and falls back on invalid CORS origins", async () => {
    process.env.CORS_ORIGINS = "https://evil.com";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    
    const app = await buildApp({ logger: false });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Rejected invalid origin"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("falling back to defaults"));
    
    await app.close();
  });

  it("handles empty CORS_ORIGINS", async () => {
    process.env.CORS_ORIGINS = "";
    const app = await buildApp({ logger: false });
    expect(app).toBeDefined();
    await app.close();
  });
});
