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
import {
  classifyHooksActivation,
  formatHooksStatusMessage,
  buildHookJsonOutput,
} from "../check-hooks-active.mjs";

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

  it("is NOT inert when only ONE of pre-commit/pre-push is present", () => {
    expect(
      classifyHooksActivation({
        hooksPath: ".husky/_",
        dirExists: true,
        entries: ["pre-commit", "husky.sh", "h", ".gitignore"],
      })
    ).toEqual({ status: "populated", inert: false });
  });

  it("is inert when the directory holds only husky's own internal files — no real hook stub", () => {
    // A directory can be non-empty and still have zero hook files: `h` is
    // husky's shared internal helper and `.gitignore` is boilerplate it
    // writes — neither is a hook git will ever invoke. Only `pre-commit` or
    // `pre-push` actually being present means a hook can fire.
    expect(
      classifyHooksActivation({
        hooksPath: ".husky/_",
        dirExists: true,
        entries: ["h", ".gitignore"],
      })
    ).toEqual({ status: "no-hook-files", inert: true });
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

  it("names `pnpm install` as the fix when the directory has no real hook stub", () => {
    const message = formatHooksStatusMessage({ status: "no-hook-files", inert: true });
    expect(message).toContain("pnpm install");
  });
});

describe("buildHookJsonOutput", () => {
  it("puts the message in both systemMessage and hookSpecificOutput.additionalContext", () => {
    const message = "⚠️  Git hooks are inert — run 'pnpm install'.";
    expect(buildHookJsonOutput(message)).toEqual({
      systemMessage: message,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: message,
      },
    });
  });

  it("round-trips through JSON.stringify/parse without hand-escaping", () => {
    // Message text can contain quotes, backslashes, newlines — anything a
    // human-facing warning might contain. JSON.stringify must be the only
    // thing that ever touches escaping.
    const message = `A "quoted" warning with a backslash \\ and a\nnewline.`;
    const parsed = JSON.parse(JSON.stringify(buildHookJsonOutput(message)));
    expect(parsed.systemMessage).toBe(message);
    expect(parsed.hookSpecificOutput.additionalContext).toBe(message);
  });
});
