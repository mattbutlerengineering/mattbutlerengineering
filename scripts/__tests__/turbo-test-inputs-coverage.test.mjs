import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #6497: root `tasks.test.inputs` was `src/**`, `package.json`, `vitest.config.ts`,
 * so packages whose tests live outside `src/` (infrastructure/worker's root
 * `*.test.js` + `vitest.config.mjs`, infrastructure/pulumi, packages/config,
 * packages/rialto/scripts, plugins/acmm) replayed a cached pass after their
 * tests or code changed. This reads turbo's own resolved input set per `test`
 * task (dry-run, nothing executes) and asserts every git-tracked test file of
 * the package is in it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//;

function run(cmd, args) {
  const env = { ...process.env, TURBO_TELEMETRY_DISABLED: "1" };
  // Never let the probe talk to a remote cache.
  delete env.TURBO_TOKEN;
  delete env.TURBO_TEAM;
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    env,
    maxBuffer: 256 * 1024 * 1024,
  });
}

const { tasks } = JSON.parse(
  run(resolve(ROOT, "node_modules/.bin/turbo"), ["run", "test", "--dry-run=json"])
);
const tracked = run("git", ["ls-files", "-z"]).split("\0").filter(Boolean);

const testTasks = tasks.filter(
  (t) => t.task === "test" && t.directory && t.directory !== "." && t.command !== "<NONEXISTENT>"
);

describe("turbo `test` task inputs cover each package's tracked test files", () => {
  it("finds the known out-of-src packages (the probe itself works)", () => {
    const dirs = testTasks.map((t) => t.directory);
    expect(dirs).toEqual(
      expect.arrayContaining(["infrastructure/worker", "packages/config", "packages/rialto"])
    );
  });

  it.each(testTasks.map((t) => [t.directory, t]))("%s", (dir, task) => {
    const inputs = new Set(Object.keys(task.inputs));
    const missing = tracked
      .filter((f) => f.startsWith(`${dir}/`) && TEST_FILE.test(f))
      .map((f) => f.slice(dir.length + 1))
      .filter((f) => !inputs.has(f));
    expect(missing).toEqual([]);
  });
});
