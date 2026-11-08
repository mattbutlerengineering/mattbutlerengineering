/**
 * Regression test for #8518: `.claude/hooks/run-related-tests.sh` never ran a
 * test. `pnpm --dir <pkg> vitest run …` made pnpm 9 spawn the package
 * directory itself (EACCES) on every firing, and the hook's stderr + exit 0
 * never reached the model anyway (same channel problem as #5766).
 *
 * A fake `pnpm` on PATH records its argv and exits with a chosen code, so the
 * hook's invocation and output contract are pinned without running vitest.
 */

import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(REPO_ROOT, ".claude", "hooks", "run-related-tests.sh");
const SETTINGS = join(REPO_ROOT, ".claude", "settings.json");

/** Builds a fixture package plus a fake pnpm that logs argv and exits with `pnpmExit`. */
function makeFixture({ withTest = true, pnpmExit = 0, pnpmOutput = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "related-tests-"));
  const pkg = join(root, "pkg");
  mkdirSync(join(pkg, "src"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), "{}");
  writeFileSync(join(pkg, "vitest.config.ts"), "export default {};");
  writeFileSync(join(pkg, "src", "foo.ts"), "export const foo = 1;");
  if (withTest) writeFileSync(join(pkg, "src", "foo.test.ts"), "// test");

  const bin = join(root, "bin");
  mkdirSync(bin);
  const argvLog = join(root, "pnpm-argv.log");
  const fakePnpm = join(bin, "pnpm");
  writeFileSync(
    fakePnpm,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${argvLog}"\nprintf '%s\\n' ${JSON.stringify(pnpmOutput)}\nexit ${pnpmExit}\n`
  );
  chmodSync(fakePnpm, 0o755);

  return { root, pkg, bin, argvLog };
}

function runHook(filePath, bin) {
  return spawnSync("bash", [HOOK, filePath], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
}

describe("run-related-tests.sh", () => {
  let fixture;

  afterEach(() => {
    if (fixture) rmSync(fixture.root, { recursive: true, force: true });
    fixture = undefined;
  });

  it("skips a non-TS/JS file silently without calling pnpm", () => {
    fixture = makeFixture();
    const md = join(fixture.pkg, "README.md");
    writeFileSync(md, "# hi");

    const result = runHook(md, fixture.bin);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(fixture.argvLog)).toBe(false);
  });

  it("skips a source file with no sibling test silently", () => {
    fixture = makeFixture({ withTest: false });

    const result = runHook(join(fixture.pkg, "src", "foo.ts"), fixture.bin);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(fixture.argvLog)).toBe(false);
  });

  it("runs the sibling test through `pnpm exec vitest` and stays silent on pass", () => {
    fixture = makeFixture({ pnpmExit: 0 });

    const result = runHook(join(fixture.pkg, "src", "foo.ts"), fixture.bin);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    const argv = readFileSync(fixture.argvLog, "utf8").trim().split("\n");
    expect(argv).toEqual([
      "--dir",
      fixture.pkg,
      "exec",
      "vitest",
      "run",
      "src/foo.test.ts",
      "--reporter=dot",
    ]);
  });

  it("reports a failing test as PostToolUse additionalContext JSON on stdout, exit 0", () => {
    fixture = makeFixture({
      pnpmExit: 1,
      pnpmOutput: 'AssertionError: expected 1 to be 2 "quoted"',
    });

    const result = runHook(join(fixture.pkg, "src", "foo.ts"), fixture.bin);

    expect(result.status).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]);
    expect(payload.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(payload.hookSpecificOutput.additionalContext).toContain(
      "Test failure in related file: src/foo.test.ts"
    );
    expect(payload.hookSpecificOutput.additionalContext).toContain('expected 1 to be 2 "quoted"');
  });
});

describe("run-related-tests.sh wiring", () => {
  it("has a timeout in seconds, not milliseconds", () => {
    const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
    const entries = settings.hooks.PostToolUse.flatMap((group) => group.hooks);
    const entry = entries.find((hook) => hook.command.includes("run-related-tests.sh"));

    expect(entry).toBeDefined();
    expect(entry.timeout).toBe(60);
  });
});
