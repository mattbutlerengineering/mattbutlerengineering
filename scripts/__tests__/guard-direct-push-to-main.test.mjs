/**
 * Tests for the pre-push guard that refuses a direct push to `main` (#4664).
 *
 * Two layers, matching scripts/__tests__/hook-input.test.mjs:
 *   1. Unit — `classifyPushTarget` against the exact stdin shapes git's
 *      pre-push hook emits.
 *   2. Seam — the REAL `.husky/pre-push` file is executed as a shell script
 *      with stubbed `node`/`pnpm` on PATH, proving the guard is wired into
 *      the hook and that its verdict controls the hook's exit code. A guard
 *      that exists but is never invoked is the "shipped but never exercised"
 *      defect this repo keeps rediscovering.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyPushTarget,
  formatRefusal,
  isOverrideEnabled,
  OVERRIDE_ENV_VAR,
  PROTECTED_BRANCHES,
} from "../guard-direct-push-to-main.mjs";

/** Generous ceiling: the seam tests spawn real subprocesses. */
const SEAM_TIMEOUT_MS = 60_000;

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const GUARD_PATH = join(REPO_ROOT, "scripts", "guard-direct-push-to-main.mjs");
const PRE_PUSH_PATH = join(REPO_ROOT, ".husky", "pre-push");

const ZERO_SHA = "0".repeat(40);
const LOCAL_SHA = "a".repeat(40);
const REMOTE_SHA = "b".repeat(40);

/** One git pre-push stdin line: "<local ref> <local sha> <remote ref> <remote sha>". */
const line = (localRef, remoteRef, localSha = LOCAL_SHA, remoteSha = REMOTE_SHA) =>
  `${localRef} ${localSha} ${remoteRef} ${remoteSha}\n`;

describe("classifyPushTarget", () => {
  it("blocks `git push origin main` from a checked-out main", () => {
    const result = classifyPushTarget(line("refs/heads/main", "refs/heads/main"));
    expect(result.decision).toBe("block");
    expect(result.blockedRefs).toEqual(["refs/heads/main"]);
  });

  it("blocks `git push origin HEAD:main` (local ref is HEAD, destination is still main)", () => {
    expect(classifyPushTarget(line("HEAD", "refs/heads/main")).decision).toBe("block");
  });

  it("blocks a force push to main (identical stdin shape, non-fast-forward shas)", () => {
    // pre-push stdin carries no --force flag: a force push presents exactly
    // like a normal one, so the destination-ref rule catches it for free.
    const result = classifyPushTarget(
      line("refs/heads/main", "refs/heads/main", LOCAL_SHA, "c".repeat(40))
    );
    expect(result.decision).toBe("block");
  });

  it("blocks a deletion of main (`git push origin :main`)", () => {
    const result = classifyPushTarget(`(delete) ${ZERO_SHA} refs/heads/main ${REMOTE_SHA}\n`);
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/delet/i);
  });

  it("blocks a bare `main` remote ref (no refs/heads/ prefix)", () => {
    expect(classifyPushTarget(line("HEAD", "main")).decision).toBe("block");
  });

  it("blocks when any line in a multi-ref push targets main", () => {
    const stdin =
      line("refs/heads/feature/x", "refs/heads/feature/x") +
      line("refs/heads/main", "refs/heads/main");
    expect(classifyPushTarget(stdin).decision).toBe("block");
  });

  it("allows an ordinary feature-branch push", () => {
    expect(classifyPushTarget(line("refs/heads/fix/thing", "refs/heads/fix/thing")).decision).toBe(
      "allow"
    );
  });

  it("allows a branch whose name merely contains `main`", () => {
    expect(
      classifyPushTarget(line("refs/heads/fix/domain-model", "refs/heads/fix/domain-model"))
        .decision
    ).toBe("allow");
    expect(
      classifyPushTarget(line("refs/heads/maintenance", "refs/heads/maintenance")).decision
    ).toBe("allow");
  });

  it("allows a tag that happens to be named main (not a branch destination)", () => {
    expect(classifyPushTarget(line("refs/tags/main", "refs/tags/main")).decision).toBe("allow");
  });

  it("allows empty stdin (nothing to push — no destination to protect)", () => {
    expect(classifyPushTarget("").decision).toBe("allow");
    expect(classifyPushTarget("\n  \n").decision).toBe("allow");
  });

  it("allows a main push when the override is set", () => {
    const result = classifyPushTarget(line("refs/heads/main", "refs/heads/main"), {
      override: "1",
    });
    expect(result.decision).toBe("allow");
    expect(result.reason).toContain(OVERRIDE_ENV_VAR);
  });

  it("blocks an unparseable line (fails closed — the destination cannot be proven)", () => {
    const result = classifyPushTarget("refs/heads/main\n");
    expect(result.decision).toBe("block");
    expect(result.reason).toMatch(/could not parse/i);
  });

  it("blocks unparseable stdin even when it does not mention main", () => {
    expect(classifyPushTarget("garbage\n").decision).toBe("block");
  });

  it("tolerates extra trailing fields rather than failing closed on them", () => {
    // Ref names cannot contain whitespace, so field 2 is always the remote
    // ref even if a future git appends fields. Blocking here would refuse
    // ordinary feature-branch pushes, which the guard must never do.
    expect(classifyPushTarget("refs/heads/x a refs/heads/x b extra\n").decision).toBe("allow");
  });

  it("never throws on a non-string input", () => {
    expect(classifyPushTarget(undefined).decision).toBe("allow");
    expect(classifyPushTarget(null).decision).toBe("allow");
  });

  it("protects exactly the documented branch set", () => {
    expect(PROTECTED_BRANCHES).toEqual(["main"]);
  });
});

describe("measured git payloads (git 2.50.1, Apple Git-155)", () => {
  // Captured by temporarily replacing the guard invocation in .husky/pre-push
  // with `cat > <file>; exit 9` and pushing at a throwaway local bare remote,
  // so the measurement never touched origin. These are the literal bytes git
  // delivered — not a guess about the format.
  it("blocks the exact payload `git push <remote> HEAD:main` produces", () => {
    const measured =
      "HEAD d06d3854a9bc38a98dbae5d922d58c7c6cd66ba3 refs/heads/main " +
      "0000000000000000000000000000000000000000\n";
    expect(classifyPushTarget(measured).decision).toBe("block");
  });

  it("allows the empty payload `git push --dry-run` produces", () => {
    // Measured: --dry-run runs pre-push with EMPTY stdin, so the guard cannot
    // see the destination — and must not try to. A dry run pushes nothing, so
    // refusing it would block a no-op while teaching nobody anything. This is
    // why empty stdin allows, and why a dry run is NOT a valid way to test
    // this guard.
    expect(classifyPushTarget("").decision).toBe("allow");
  });
});

describe("isOverrideEnabled", () => {
  it.each(["1", "true", "yes", "anything"])("treats %s as an override", (value) => {
    expect(isOverrideEnabled(value)).toBe(true);
  });

  it.each([undefined, "", "   ", "0", "false", "FALSE"])("treats %j as unset", (value) => {
    expect(isOverrideEnabled(value)).toBe(false);
  });
});

describe("formatRefusal", () => {
  const message = formatRefusal(classifyPushTarget(line("refs/heads/main", "refs/heads/main")));

  it("names the override so the legitimate exception is discoverable", () => {
    expect(message).toContain(`${OVERRIDE_ENV_VAR}=1 git push`);
  });

  it("explains that the commit would never run pull_request CI", () => {
    expect(message).toMatch(/pull_request/);
  });

  it("explains that a formatting or lint violation on main reddens later PRs", () => {
    expect(message).toMatch(/every subsequent PR/i);
  });

  it("cites the issue that motivated the guard", () => {
    expect(message).toContain("#4664");
  });
});

describe("guard CLI", () => {
  const runCli = (stdin, extraEnv = {}) =>
    spawnSync(process.execPath, [GUARD_PATH, "check"], {
      input: stdin,
      encoding: "utf8",
      env: { ...process.env, [OVERRIDE_ENV_VAR]: "", ...extraEnv },
    });

  it("exits 1 and prints the refusal for a main push", () => {
    const result = runCli(line("refs/heads/main", "refs/heads/main"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(OVERRIDE_ENV_VAR);
  });

  it("exits 0 silently for a feature-branch push", () => {
    const result = runCli(line("refs/heads/fix/x", "refs/heads/fix/x"));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("exits 0 for a main push with the override set", () => {
    const result = runCli(line("refs/heads/main", "refs/heads/main"), { [OVERRIDE_ENV_VAR]: "1" });
    expect(result.status).toBe(0);
  });
});

describe("hook seam: .husky/pre-push actually runs the guard", () => {
  let sandbox;
  let log;
  let env;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "pre-push-guard-"));
    log = join(sandbox, "calls.log");

    const bin = join(sandbox, "bin");
    mkdirSync(bin);

    // `node` stub: delegates to the real node ONLY for the guard, so the
    // guard under test runs for real while every other step in the hook
    // (destructive-migration check, antipattern ratchet, regen gating)
    // becomes an observable no-op. Its log goes to a file, never stdout, so
    // the hook's `REGEN_MODE=$(node ...)` capture stays empty.
    const nodeStub = join(bin, "node");
    writeFileSync(
      nodeStub,
      `#!/usr/bin/env bash\nprintf 'node %s\\n' "$*" >> ${JSON.stringify(log)}\n` +
        `case "$*" in\n  *guard-direct-push-to-main.mjs*) exec ${JSON.stringify(process.execPath)} "$@" ;;\nesac\nexit 0\n`
    );
    chmodSync(nodeStub, 0o755);

    const pnpmStub = join(bin, "pnpm");
    writeFileSync(
      pnpmStub,
      `#!/usr/bin/env bash\nprintf 'pnpm %s\\n' "$*" >> ${JSON.stringify(log)}\nexit 0\n`
    );
    chmodSync(pnpmStub, 0o755);

    env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    delete env[OVERRIDE_ENV_VAR];
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  const runHook = (stdin, extraEnv = {}) =>
    spawnSync("sh", [PRE_PUSH_PATH, "origin", "git@github.com:x/y.git"], {
      cwd: REPO_ROOT,
      env: { ...env, ...extraEnv },
      input: stdin,
      encoding: "utf8",
    });

  it(
    "refuses a push to main and stops before any other pre-push step",
    () => {
      const result = runHook(line("refs/heads/main", "refs/heads/main"));

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain(OVERRIDE_ENV_VAR);

      // The guard must run first: nothing expensive may have run.
      const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
      expect(calls).not.toMatch(/check-destructive-migrations/);
      expect(calls).not.toMatch(/pnpm build/);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "lets a feature-branch push through to the rest of the hook",
    () => {
      const result = runHook(line("refs/heads/fix/x", "refs/heads/fix/x"));

      expect(result.status).toBe(0);
      const calls = readFileSync(log, "utf8");
      expect(calls).toMatch(/check-destructive-migrations/);
      expect(calls).toMatch(/check-ai-antipatterns/);
    },
    SEAM_TIMEOUT_MS
  );

  it(
    "lets a main push through when the override is set",
    () => {
      const result = runHook(line("refs/heads/main", "refs/heads/main"), {
        [OVERRIDE_ENV_VAR]: "1",
      });

      expect(result.status).toBe(0);
      expect(readFileSync(log, "utf8")).toMatch(/check-destructive-migrations/);
    },
    SEAM_TIMEOUT_MS
  );

  it("invokes the guard by path from the committed .husky/pre-push", () => {
    expect(readFileSync(PRE_PUSH_PATH, "utf8")).toContain("scripts/guard-direct-push-to-main.mjs");
  });

  it("keeps the guard tracked in the committed tree", () => {
    const tracked = execFileSync("git", ["ls-files", "scripts/guard-direct-push-to-main.mjs"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(tracked.trim()).toBe("scripts/guard-direct-push-to-main.mjs");
  });
});
