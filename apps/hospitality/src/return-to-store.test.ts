import { describe, it, expect, beforeEach } from "vitest";
import { rememberReturnTo, readReturnTo } from "./return-to-store.js";

describe("return-to-store", () => {
  beforeEach(() => {
    rememberReturnTo(undefined);
  });

  it("returns undefined before anything is remembered", () => {
    expect(readReturnTo()).toBeUndefined();
  });

  it("returns the remembered value", () => {
    rememberReturnTo("/reservations?date=2026-09-01");
    expect(readReturnTo()).toBe("/reservations?date=2026-09-01");
  });

  it("does not clear on read (render-safe under StrictMode double-render)", () => {
    rememberReturnTo("/guests");
    readReturnTo();
    expect(readReturnTo()).toBe("/guests");
  });

  it("overwrites a previous value with undefined", () => {
    rememberReturnTo("/guests");
    rememberReturnTo(undefined);
    expect(readReturnTo()).toBeUndefined();
  });
});
