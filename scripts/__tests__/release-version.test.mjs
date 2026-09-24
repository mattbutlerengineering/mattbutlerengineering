import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/release-version.sh");

/**
 * Behavioural coverage for scripts/release-version.sh, driven through a
 * stubbed `pnpm` binary on PATH -- no real changesets CLI, no real
 * package.json version bump.
 *
 * Why this script exists at all (#5721 review, round 3): changesets/action
 * runs its `version-script` input through @actions/exec's `exec()` with no
 * `args` array, which tokenizes the command STRING (argv splitting) rather
 * than spawning a shell to interpret it. The original inline multi-line
 * block (comments, `$(...)`, `if`/`fi`, a redirect) could never have run
 * that way. Checking the same logic into a real file and invoking it as
 * `bash scripts/release-version.sh` hands the interpretation to `bash`
 * instead, which is what makes it work.
 */
let dir;

function writeStub(name, body) {
  const p = join(dir, "bin", name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
}

function runScript() {
  let exitCode = 0;
  let output;
  try {
    output = execFileSync("bash", [SCRIPT], {
      cwd: dir,
      env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}` },
      encoding: "utf-8",
    });
  } catch (err) {
    exitCode = err.status ?? 1;
    output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
  return { exitCode, output };
}

function readChangelog() {
  return readFileSync(join(dir, "packages/rialto/CHANGELOG.md"), "utf-8");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "release-version-"));
  mkdirSync(join(dir, "bin"), { recursive: true });
  mkdirSync(join(dir, "packages/rialto"), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("release-version.sh", () => {
  it("runs pnpm version-packages as a plain command (no shell needed to invoke it)", () => {
    writeFileSync(join(dir, "packages/rialto/CHANGELOG.md"), "# @mattbutlerengineering/rialto\n");
    writeFileSync(
      join(dir, "packages/rialto/package.json"),
      JSON.stringify({ name: "@mattbutlerengineering/rialto", version: "0.3.0" })
    );
    writeStub(
      "pnpm",
      `if [ "$1" = "version-packages" ]; then
  echo "# @mattbutlerengineering/rialto" > packages/rialto/CHANGELOG.md
  echo "" >> packages/rialto/CHANGELOG.md
  echo "## 0.3.0" >> packages/rialto/CHANGELOG.md
  exit 0
fi
exit 1`
    );

    const { exitCode } = runScript();

    expect(exitCode).toBe(0);
    expect(readChangelog()).toContain("## 0.3.0");
  });

  it("prepends a version block by hand when the CHANGELOG hash is unchanged (silent-skip fallback)", () => {
    writeFileSync(
      join(dir, "packages/rialto/CHANGELOG.md"),
      "# @mattbutlerengineering/rialto\n\n## 0.2.0\n\nold entry\n"
    );
    writeFileSync(
      join(dir, "packages/rialto/package.json"),
      JSON.stringify({ name: "@mattbutlerengineering/rialto", version: "0.3.0" })
    );
    // Simulates the real bug this branch guards: `changeset version` ran
    // (bumped package.json, which the script doesn't touch here) but
    // prettier silently skipped the CHANGELOG.md write, so its content
    // (and hash) is identical before and after.
    writeStub("pnpm", 'if [ "$1" = "version-packages" ]; then exit 0; fi\nexit 1');

    const { exitCode, output } = runScript();

    expect(exitCode).toBe(0);
    expect(output).toContain("::warning::packages/rialto/CHANGELOG.md was not updated");
    const changelog = readChangelog();
    expect(changelog).toContain("## 0.3.0");
    expect(changelog).toContain("old entry");
  });

  it("exits non-zero when pnpm version-packages fails, per set -e", () => {
    writeFileSync(join(dir, "packages/rialto/CHANGELOG.md"), "# @mattbutlerengineering/rialto\n");
    writeFileSync(
      join(dir, "packages/rialto/package.json"),
      JSON.stringify({ name: "@mattbutlerengineering/rialto", version: "0.3.0" })
    );
    writeStub("pnpm", 'echo "changeset version blew up" >&2\nexit 1');

    const { exitCode } = runScript();

    expect(exitCode).not.toBe(0);
  });
});
