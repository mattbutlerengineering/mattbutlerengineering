import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/run-pulumi-r2-validation-arm.sh");

/**
 * Behavioural coverage for the #4119 arm runner, driven through stubbed
 * `pulumi`/`npm` binaries on PATH — no network, no real Pulumi, no R2.
 *
 * The bug these tests pin: `pulumi login` and `pulumi stack init` used to run
 * unguarded under the script's `set -e`, so an arm that failed AT LOGIN
 * aborted before writing `outcome` to $GITHUB_OUTPUT. The reporting job then
 * could not distinguish a genuine refutation of the fix under test from the
 * harness breaking before it measured anything. Run 35675244560 hit exactly
 * that: both arms died at login with R2's `InvalidDigest`, which is a clean
 * result, and the verdict still rendered as `unknown`.
 */
let dir;

function writeStub(name, body) {
  const p = join(dir, "bin", name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
}

function runArm() {
  const outputFile = join(dir, "github-output");
  writeFileSync(outputFile, "");

  let exitCode = 0;
  try {
    execFileSync("bash", [SCRIPT, "with-fix", "s3://scratch-bucket-stub", join(dir, "work")], {
      env: {
        ...process.env,
        PATH: `${join(dir, "bin")}:${process.env.PATH}`,
        GITHUB_OUTPUT: outputFile,
        GITHUB_RUN_ID: "test-run",
      },
      stdio: "pipe",
    });
  } catch (err) {
    exitCode = err.status ?? 1;
  }

  return { exitCode, output: readFileSync(outputFile, "utf8") };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pulumi-r2-arm-"));
  execFileSync("mkdir", ["-p", join(dir, "bin")]);
  // npm is only used to install the zero-resource program's deps.
  writeStub("npm", "exit 0");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("run-pulumi-r2-validation-arm.sh", () => {
  it("records outcome=fail when the backend rejects `pulumi login`", () => {
    // Mirrors R2's real behaviour on Pulumi 3.256.0: the very first state
    // write, `.pulumi/meta.yaml` during login, is what gets rejected.
    writeStub(
      "pulumi",
      `if [ "$1" = "login" ]; then
  echo 'error: problem logging in: write ".pulumi/meta.yaml": api error InvalidDigest' >&2
  exit 1
fi
exit 0`
    );

    const { exitCode, output } = runArm();

    expect(output).toContain("arm=with-fix");
    expect(output).toContain("outcome=fail");
    expect(exitCode).toBe(1);
  });

  it("records outcome=fail when `pulumi stack init` fails", () => {
    writeStub(
      "pulumi",
      `if [ "$1" = "stack" ] && [ "$2" = "init" ]; then exit 1; fi
exit 0`
    );

    const { output } = runArm();

    expect(output).toContain("outcome=fail");
  });

  it("records outcome=pass when every state operation succeeds", () => {
    writeStub("pulumi", "exit 0");

    const { exitCode, output } = runArm();

    expect(output).toContain("arm=with-fix");
    expect(output).toContain("outcome=pass");
    expect(exitCode).toBe(0);
  });

  it("never reports a verdict-free arm for any pulumi outcome", () => {
    // The reporting job keys entirely off this output. An empty value is the
    // ambiguous `unknown` state that made run 35675244560 unreadable.
    //
    // Scoped to the pulumi calls on purpose: `npm install` is deliberately
    // left outside the if/elif chain, so a dependency-install failure still
    // writes no outcome. That is the correct reading — a harness that could
    // not build its own test program has not refuted anything, and
    // `unknown` is exactly what it should report.
    for (const stub of ["exit 0", 'if [ "$1" = "login" ]; then exit 1; fi\nexit 0']) {
      writeStub("pulumi", stub);
      expect(runArm().output).toMatch(/outcome=(pass|fail)/);
    }
  });
});
