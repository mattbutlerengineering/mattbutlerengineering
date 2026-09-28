import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/release-publish.sh");

/**
 * Behavioural coverage for scripts/release-publish.sh, driven through a
 * stubbed `pnpm` binary on PATH -- no real changesets CLI, no real registry
 * call.
 *
 * Why this script exists (refs #3322): `changeset publish` against
 * npm.pkg.github.com 403s with GITHUB_TOKEN (`E403 permission_denied:
 * read_package`, runs 35961368353 attempts 1-3) because
 * @mattbutlerengineering/rialto was hand-published in April with no
 * `repository` field, so GitHub Packages never linked it to this repo --
 * GITHUB_TOKEN can only read/write packages GitHub Packages considers linked
 * to the repo running it. release.yml sets NODE_AUTH_TOKEN from the
 * RIALTO_PACKAGES_TOKEN secret instead.
 *
 * Publishing is currently opt-in (refs #3322 follow-up): nothing outside
 * this monorepo installs @mattbutlerengineering/rialto (every consumer uses
 * `workspace:*`), so an unset RIALTO_PACKAGES_TOKEN is an intentional
 * "publishing disabled" state, not a misconfiguration -- the script skips
 * the publish step and exits 0 rather than red-ing the Release workflow on
 * every push to main (runs 36054320926, 36053448723, 36051601574,
 * 36035638679). Setting the secret resumes publishing automatically.
 */
let dir;

function writeStub(name, body) {
  const p = join(dir, "bin", name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
}

function runScript(env = {}) {
  let exitCode = 0;
  let output;
  try {
    output = execFileSync("bash", [SCRIPT], {
      cwd: dir,
      env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, ...env },
      encoding: "utf-8",
    });
  } catch (err) {
    exitCode = err.status ?? 1;
    output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
  return { exitCode, output };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "release-publish-"));
  mkdirSync(join(dir, "bin"), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("release-publish.sh", () => {
  it("skips publish with no pnpm call when NODE_AUTH_TOKEN is unset", () => {
    writeStub("pnpm", 'echo "$*" >> calls.log\nexit 0');

    const { exitCode, output } = runScript({ NODE_AUTH_TOKEN: "" });

    expect(exitCode).toBe(0);
    expect(output).toContain("::notice::RIALTO_PACKAGES_TOKEN is not set -- skipping publish");
    expect(existsSync(join(dir, "calls.log"))).toBe(false);
  });

  it("invokes changeset publish when NODE_AUTH_TOKEN is set", () => {
    writeStub("pnpm", 'echo "$*" >> calls.log\nexit 0');

    const { exitCode } = runScript({ NODE_AUTH_TOKEN: "ghp_fake_token" });

    expect(exitCode).toBe(0);
    const calls = readFileSync(join(dir, "calls.log"), "utf-8").trim();
    expect(calls).toBe("exec changeset publish");
  });
});
