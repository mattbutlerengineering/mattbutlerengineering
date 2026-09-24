import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveRlsContextMode,
  recordUnscopedRlsQuery,
  setRlsTripwireLogger,
  RlsUnscopedQueryError,
} from "./rls-context-mode.js";

describe("resolveRlsContextMode", () => {
  const ORIGINAL_ENV = process.env.RLS_CONTEXT_MODE;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.RLS_CONTEXT_MODE;
    else process.env.RLS_CONTEXT_MODE = ORIGINAL_ENV;
  });

  it("defaults to warn when unset (production default, ADR-026 §3.3 / #5369 PR 1)", () => {
    delete process.env.RLS_CONTEXT_MODE;

    expect(resolveRlsContextMode()).toBe("warn");
  });

  it("resolves throw when explicitly set (for the future route-sweep suite)", () => {
    process.env.RLS_CONTEXT_MODE = "throw";

    expect(resolveRlsContextMode()).toBe("throw");
  });

  it("resolves off when explicitly set (for tests that need it disabled)", () => {
    process.env.RLS_CONTEXT_MODE = "off";

    expect(resolveRlsContextMode()).toBe("off");
  });

  it("falls back to warn on an unrecognized value — a typo can never silently escalate to throw", () => {
    process.env.RLS_CONTEXT_MODE = "explode";

    expect(resolveRlsContextMode()).toBe("warn");
  });
});

describe("recordUnscopedRlsQuery", () => {
  const ORIGINAL_ENV = process.env.RLS_CONTEXT_MODE;
  const logger = { warn: vi.fn() };

  beforeEach(() => {
    logger.warn.mockClear();
    setRlsTripwireLogger(logger);
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.RLS_CONTEXT_MODE;
    else process.env.RLS_CONTEXT_MODE = ORIGINAL_ENV;
  });

  it("logs one structured rls_unscoped_query line in warn mode, never throwing", () => {
    process.env.RLS_CONTEXT_MODE = "warn";

    expect(() => recordUnscopedRlsQuery({ model: "table", method: "findMany" })).not.toThrow();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { model: "table", method: "findMany", route: null },
      "rls_unscoped_query"
    );
  });

  it("throws RlsUnscopedQueryError in throw mode instead of logging (for the sweep suite)", () => {
    process.env.RLS_CONTEXT_MODE = "throw";

    expect(() => recordUnscopedRlsQuery({ model: "guest", method: "create" })).toThrow(
      RlsUnscopedQueryError
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does nothing in off mode", () => {
    process.env.RLS_CONTEXT_MODE = "off";

    expect(() => recordUnscopedRlsQuery({ model: "table", method: "findMany" })).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("never throws in prod (unset env — the default must stay behavior-neutral)", () => {
    delete process.env.RLS_CONTEXT_MODE;

    expect(() => recordUnscopedRlsQuery({ model: "reservation", method: "update" })).not.toThrow();
  });
});
