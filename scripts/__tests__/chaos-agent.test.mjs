import { test, expect, describe, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { COORDINATION_LABELS } from "@mbe/gh-client";
import { BUG_CATALOG as coreCatalog } from "@mbe/agent-core";
import { injectBugIntoFile, BUG_CATALOG, buildChaosPrArgs } from "../chaos-agent.mjs";

// #2941: the pre-#2927 version of this suite ran the full chaos-agent CLI via
// execFileSync, which unconditionally `git checkout -b` + commits on a
// successful injection — checking out real branches in the invoking
// worktree. These tests instead call the exported pure/thin-wrapper
// functions directly (no subprocess, no `main()`, no git operations), so
// running this suite can never mutate git state. See #2941 for the
// underlying CLI hazard, which is out of scope for #2927.

describe("Chaos Agent", () => {
  // A fresh temp file per test, outside the repo's tracked tree, so nothing
  // here can ever collide with (or resurrect) the tracked chaos artifacts
  // documented in #2941.
  let tempFile;

  beforeEach(() => {
    tempFile = path.join(os.tmpdir(), `chaos-agent-test-${Date.now()}-${Math.random()}.tsx`);
    fs.writeFileSync(
      tempFile,
      `
export default function MyComponent() {
  return (
    <div aria-label="test-label">
      <h1>Hello</h1>
    </div>
  );
}
    `
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  });

  test("re-exports the agent-core bug catalog (single source of truth, #2927)", () => {
    expect(BUG_CATALOG).toBe(coreCatalog);
  });

  test("injects console-error", () => {
    const injected = injectBugIntoFile("console-error", tempFile);

    expect(injected).toBe(true);
    const content = fs.readFileSync(tempFile, "utf-8");
    expect(content).toContain("CHAOS-ERROR");
    expect(content).toContain("import React");
  });

  test("injects accessibility bug", () => {
    const injected = injectBugIntoFile("accessibility", tempFile);

    expect(injected).toBe(true);
    const content = fs.readFileSync(tempFile, "utf-8");
    expect(content).not.toContain('aria-label="test-label"');
  });

  test("injects lighthouse-perf bug", () => {
    const injected = injectBugIntoFile("lighthouse-perf", tempFile);

    expect(injected).toBe(true);
    const content = fs.readFileSync(tempFile, "utf-8");
    expect(content).toContain("CHAOS-REGRESSION");
  });

  test("injects scout-todo bug", () => {
    const injected = injectBugIntoFile("scout-todo", tempFile);

    expect(injected).toBe(true);
    const content = fs.readFileSync(tempFile, "utf-8");
    expect(content.startsWith("// FIXME:")).toBe(true);
  });

  test("returns false when the pattern has no match", () => {
    fs.writeFileSync(tempFile, "const x = 1;\n");
    const injected = injectBugIntoFile("console-error", tempFile);

    expect(injected).toBe(false);
  });

  test("builds the chaos PR args using the shared ready label constant (#2933)", () => {
    const prArgs = buildChaosPrArgs(
      "console-error",
      "/repo/apps/marketing/src/Foo.tsx",
      "apps/marketing/src/Foo.tsx"
    );

    // The ready label must come from @mbe/gh-client's coordination-label
    // machine, not a re-typed string literal, so it can't drift (#2933).
    const readyIdx = prArgs.indexOf(COORDINATION_LABELS.READY);
    expect(readyIdx).toBeGreaterThan(-1);
    expect(prArgs[readyIdx - 1]).toBe("--label");
    expect(prArgs).toContain("chaos-audit");
    expect(prArgs).toContain("audit");
  });
});
