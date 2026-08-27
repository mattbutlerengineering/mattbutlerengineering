import { test, expect, describe, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { COORDINATION_LABELS } from "@mbe/gh-client";
import { BUG_CATALOG as coreCatalog } from "@mbe/agent-core";
import {
  injectBugIntoFile,
  BUG_CATALOG,
  buildChaosPrArgs,
  selectInjectableCandidate,
  commitChaosBug,
} from "../chaos-agent.mjs";

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

  test("sets a local git identity before committing (#4287 — CI runners have none)", () => {
    const calls = [];
    const exec = (cmd, args) => calls.push([cmd, ...args]);

    commitChaosBug(exec, {
      branchName: "chaos/synthetic-bug-123",
      targetFile: "/repo/apps/marketing/src/Foo.tsx",
      type: "console-error",
      relativePath: "apps/marketing/src/Foo.tsx",
    });

    const commitIdx = calls.findIndex((c) => c[1] === "commit");
    const nameIdx = calls.findIndex(
      (c) => c[1] === "config" && c[2] === "user.name" && c[3] === "github-actions[bot]"
    );
    const emailIdx = calls.findIndex(
      (c) =>
        c[1] === "config" &&
        c[2] === "user.email" &&
        c[3] === "41898282+github-actions[bot]@users.noreply.github.com"
    );

    expect(nameIdx).toBeGreaterThan(-1);
    expect(emailIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(-1);
    expect(nameIdx).toBeLessThan(commitIdx);
    expect(emailIdx).toBeLessThan(commitIdx);
  });
});

// #4503: --random used to pick exactly one (type, file) pairing and exit 1 on
// a miss, which is why chaos-agent.yml failed 15/15 lifetime runs. This is
// the pure candidate-selection/retry decision the fix routes through,
// matching the pure-decision convention in scheduled-workflow-health.mjs and
// revert-watchdog.mjs — no I/O, no randomness, fully deterministic.
describe("selectInjectableCandidate (random-mode retry decision)", () => {
  test("returns the first candidate for which isInjectable is true", () => {
    const candidates = [
      { type: "console-error", file: "f1" },
      { type: "accessibility", file: "f2" },
      { type: "scout-todo", file: "f3" },
    ];

    const picked = selectInjectableCandidate(candidates, (c) => c.type === "accessibility");

    expect(picked).toEqual({ type: "accessibility", file: "f2" });
  });

  test("returns null when no candidate is injectable", () => {
    const candidates = [
      { type: "console-error", file: "f1" },
      { type: "accessibility", file: "f2" },
    ];

    const picked = selectInjectableCandidate(candidates, () => false);

    expect(picked).toBeNull();
  });

  test("a catalog where only one (type, file) pair is injectable still produces a successful injection", () => {
    const candidates = [
      { type: "console-error", file: "miss-1.tsx" },
      { type: "lighthouse-perf", file: "miss-2.tsx" },
      { type: "accessibility", file: "hit.tsx" },
    ];
    const injectableFiles = new Set(["hit.tsx"]);

    const picked = selectInjectableCandidate(candidates, (c) => injectableFiles.has(c.file));

    expect(picked).toEqual({ type: "accessibility", file: "hit.tsx" });
  });

  test("a catalog where nothing is injectable exits non-zero (yields null)", () => {
    const candidates = [
      { type: "console-error", file: "miss-1.tsx" },
      { type: "accessibility", file: "miss-2.tsx" },
      { type: "lighthouse-perf", file: "miss-3.tsx" },
      { type: "scout-todo", file: "miss-4.tsx" },
    ];

    const picked = selectInjectableCandidate(candidates, () => false);

    expect(picked).toBeNull();
  });

  test("stops checking once it finds a hit (does not evaluate later candidates)", () => {
    const seen = [];
    const candidates = [{ id: 1 }, { id: 2 }, { id: 3 }];

    selectInjectableCandidate(candidates, (c) => {
      seen.push(c.id);
      return c.id === 2;
    });

    expect(seen).toEqual([1, 2]);
  });

  test("returns null on an empty candidate list", () => {
    expect(selectInjectableCandidate([], () => true)).toBeNull();
  });
});
