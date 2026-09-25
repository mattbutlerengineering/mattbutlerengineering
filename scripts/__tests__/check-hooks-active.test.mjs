/**
 * Guard for #5766: every local git hook is silently inert in a checkout
 * where `pnpm install` has not run, and nothing warns.
 *
 * `classifyHooksActivation` is the pure decision — no I/O — that turns the
 * resolved `core.hooksPath` value plus a directory listing into one of four
 * states. `formatHooksStatusMessage` turns an inert classification into the
 * human-facing warning naming the fix (`pnpm install`); a healthy
 * classification produces no message.
 */

import { describe, it, expect } from "vitest";
import { classifyHooksActivation, formatHooksStatusMessage } from "../check-hooks-active.mjs";

describe("classifyHooksActivation", () => {
  it("is inert when core.hooksPath points at a directory that does not exist", () => {
    expect(
      classifyHooksActivation({ hooksPath: ".husky/_", dirExists: false, entries: [] })
    ).toEqual({ status: "missing", inert: true });
  });

  it("is inert when the hooks directory exists but is empty", () => {
    expect(
      classifyHooksActivation({ hooksPath: ".husky/_", dirExists: true, entries: [] })
    ).toEqual({ status: "empty", inert: true });
  });

  it("is NOT inert when the hooks directory is populated", () => {
    expect(
      classifyHooksActivation({
        hooksPath: ".husky/_",
        dirExists: true,
        entries: ["pre-commit", "pre-push", "husky.sh"],
      })
    ).toEqual({ status: "populated", inert: false });
  });

  it("is inert, and does not crash, when core.hooksPath is unset entirely", () => {
    expect(classifyHooksActivation({ hooksPath: null, dirExists: false, entries: [] })).toEqual({
      status: "unset",
      inert: true,
    });
  });

  it("treats an empty-string hooksPath the same as unset", () => {
    expect(classifyHooksActivation({ hooksPath: "", dirExists: false, entries: [] })).toEqual({
      status: "unset",
      inert: true,
    });
  });
});

describe("formatHooksStatusMessage", () => {
  it("returns null for a healthy (populated) classification", () => {
    expect(formatHooksStatusMessage({ status: "populated", inert: false })).toBeNull();
  });

  it("names `pnpm install` as the fix for a missing hooks dir", () => {
    const message = formatHooksStatusMessage({ status: "missing", inert: true });
    expect(message).toContain("pnpm install");
    expect(message).toMatch(/inert/i);
  });

  it("names `pnpm install` as the fix for an empty hooks dir", () => {
    const message = formatHooksStatusMessage({ status: "empty", inert: true });
    expect(message).toContain("pnpm install");
  });

  it("names `pnpm install` as the fix when core.hooksPath is unset", () => {
    const message = formatHooksStatusMessage({ status: "unset", inert: true });
    expect(message).toContain("pnpm install");
  });
});
