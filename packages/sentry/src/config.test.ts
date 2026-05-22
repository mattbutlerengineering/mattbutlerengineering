import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  const savedEnv = {
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    SENTRY_RELEASE: process.env.SENTRY_RELEASE,
    NODE_ENV: process.env.NODE_ENV,
    npm_package_version: process.env.npm_package_version,
  };

  beforeEach(() => {
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_RELEASE;
    delete process.env.NODE_ENV;
    delete process.env.npm_package_version;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns enabled=false when DSN is undefined", () => {
    const config = resolveConfig(undefined);
    expect(config.enabled).toBe(false);
    expect(config.dsn).toBe("");
  });

  it("returns enabled=false when DSN is empty string", () => {
    const config = resolveConfig("");
    expect(config.enabled).toBe(false);
  });

  it("returns enabled=true when DSN is provided", () => {
    const config = resolveConfig("https://key@sentry.io/123");
    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe("https://key@sentry.io/123");
  });

  it("uses SENTRY_ENVIRONMENT when set", () => {
    process.env.SENTRY_ENVIRONMENT = "staging";
    const config = resolveConfig("https://key@sentry.io/123");
    expect(config.environment).toBe("staging");
  });

  it("falls back to NODE_ENV when SENTRY_ENVIRONMENT is not set", () => {
    process.env.NODE_ENV = "production";
    const config = resolveConfig("https://key@sentry.io/123");
    expect(config.environment).toBe("production");
  });

  it("defaults environment to 'development' when no env vars set", () => {
    const config = resolveConfig("https://key@sentry.io/123");
    expect(config.environment).toBe("development");
  });

  it("uses SENTRY_RELEASE when set", () => {
    process.env.SENTRY_RELEASE = "v1.2.3";
    const config = resolveConfig("https://key@sentry.io/123");
    expect(config.release).toBe("v1.2.3");
  });

  it("falls back to npm_package_version for release", () => {
    process.env.npm_package_version = "0.5.0";
    const config = resolveConfig("https://key@sentry.io/123");
    expect(config.release).toBe("0.5.0");
  });
});
