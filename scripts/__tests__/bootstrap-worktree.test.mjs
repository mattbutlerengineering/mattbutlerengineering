import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  decideBootstrapSteps,
  distConsumedPackages,
  hasNodeModulesProbe,
  isLockNewerProbe,
  listWorkspacePackagesProbe,
  missingDistsProbe,
  probeBootstrapSteps,
  formatBootstrapDecision,
  ensureWorktreeHooksPath,
  hooksActive,
} from "../bootstrap-worktree.mjs";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// decideBootstrapSteps — pure decision over three inputs (architecture.md
// §1): install when !hasNodeModules || lockNewer; build when missingDists
// is non-empty; install always ordered before build; [] when neither
// applies; invalid input throws (fail closed, never guess).
// ---------------------------------------------------------------------------

describe("decideBootstrapSteps", () => {
  test("missing node_modules → install step", () => {
    expect(
      decideBootstrapSteps({ hasNodeModules: false, lockNewer: false, missingDists: [] })
    ).toEqual([{ step: "install" }]);
  });

  test("stale lockfile with node_modules present → install step", () => {
    expect(
      decideBootstrapSteps({ hasNodeModules: true, lockNewer: true, missingDists: [] })
    ).toEqual([{ step: "install" }]);
  });

  test("missing dists → build step naming exactly those packages", () => {
    expect(
      decideBootstrapSteps({
        hasNodeModules: true,
        lockNewer: false,
        missingDists: ["@mbe/cli", "@mattbutlerengineering/rialto"],
      })
    ).toEqual([{ step: "build", packages: ["@mbe/cli", "@mattbutlerengineering/rialto"] }]);
  });

  test("install ordered before build when both apply", () => {
    expect(
      decideBootstrapSteps({ hasNodeModules: false, lockNewer: false, missingDists: ["@mbe/cli"] })
    ).toEqual([{ step: "install" }, { step: "build", packages: ["@mbe/cli"] }]);
  });

  test("nothing to do → []", () => {
    expect(
      decideBootstrapSteps({ hasNodeModules: true, lockNewer: false, missingDists: [] })
    ).toEqual([]);
  });

  test("throws on non-boolean hasNodeModules", () => {
    expect(() =>
      decideBootstrapSteps({ hasNodeModules: "yes", lockNewer: false, missingDists: [] })
    ).toThrow();
  });

  test("throws on non-boolean lockNewer", () => {
    expect(() =>
      decideBootstrapSteps({ hasNodeModules: true, lockNewer: 1, missingDists: [] })
    ).toThrow();
  });

  test("throws on non-array missingDists", () => {
    expect(() =>
      decideBootstrapSteps({ hasNodeModules: true, lockNewer: false, missingDists: "none" })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// distConsumedPackages — pure filter over parsed package.json descriptors:
// qualifies when any of main/module/types/exports (string leaves,
// recursively) resolves under dist/.
// ---------------------------------------------------------------------------

describe("distConsumedPackages", () => {
  test("a package with main: dist/index.js qualifies", () => {
    const pkgs = [{ name: "@mbe/cli", dir: "tools/cli", json: { main: "dist/index.js" } }];
    expect(distConsumedPackages(pkgs)).toEqual([{ name: "@mbe/cli", dir: "tools/cli" }]);
  });

  test("exports with a nested dist leaf qualifies", () => {
    const pkgs = [
      {
        name: "@mattbutlerengineering/rialto",
        dir: "packages/rialto",
        json: {
          exports: {
            ".": { import: "./dist/index.mjs", require: "./dist/index.cjs" },
            "./styles": "./dist/lib/styles.css",
          },
        },
      },
    ];
    expect(distConsumedPackages(pkgs)).toEqual([
      { name: "@mattbutlerengineering/rialto", dir: "packages/rialto" },
    ]);
  });

  test("a package with only src/ entrypoints does not qualify", () => {
    const pkgs = [
      {
        name: "@mbe/agent-service",
        dir: "services/agent",
        json: { main: "src/index.ts", exports: { ".": "./src/index.ts" } },
      },
    ];
    expect(distConsumedPackages(pkgs)).toEqual([]);
  });

  test("empty workspace → []", () => {
    expect(distConsumedPackages([])).toEqual([]);
  });

  test("a package with no main/module/types/exports does not qualify", () => {
    const pkgs = [{ name: "@mbe/scratch", dir: "tools/scratch", json: {} }];
    expect(distConsumedPackages(pkgs)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Probes (WO-7) — thin fs.statSync/existsSync wrappers over the real repo
// tree (architecture.md §1: "exposed for tests but not unit-tested beyond
// smoke"). These assert shape and that they run against this repo without
// throwing; the decision logic they feed is already covered above.
// ---------------------------------------------------------------------------

describe("probes (smoke)", () => {
  test("hasNodeModulesProbe returns a boolean", () => {
    expect(typeof hasNodeModulesProbe()).toBe("boolean");
  });

  test("isLockNewerProbe returns a boolean", () => {
    expect(typeof isLockNewerProbe()).toBe("boolean");
  });

  test("listWorkspacePackagesProbe finds this repo's real workspace packages", () => {
    const pkgs = listWorkspacePackagesProbe();
    expect(Array.isArray(pkgs)).toBe(true);
    expect(pkgs.length).toBeGreaterThan(0);
    expect(pkgs.some(({ name }) => name === "@mbe/scripts")).toBe(true);
  });

  test("missingDistsProbe returns an array of package names", () => {
    const missing = missingDistsProbe();
    expect(Array.isArray(missing)).toBe(true);
    expect(missing.every((name) => typeof name === "string")).toBe(true);
  });

  test("probeBootstrapSteps returns a decideBootstrapSteps-shaped array", () => {
    const steps = probeBootstrapSteps();
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.every((step) => typeof step.step === "string")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatBootstrapDecision — the `--check`/CLI output line. WO-8's hint hook
// greps this for "pending" vs. the fixed no-op line, so both shapes are
// pinned here.
// ---------------------------------------------------------------------------

describe("formatBootstrapDecision", () => {
  test("no steps → the fixed no-op line", () => {
    expect(formatBootstrapDecision([])).toBe("bootstrap-worktree: nothing to do.");
  });

  test("install only → names install", () => {
    expect(formatBootstrapDecision([{ step: "install" }])).toBe(
      "bootstrap-worktree: pending — install."
    );
  });

  test("build only → names the packages", () => {
    expect(formatBootstrapDecision([{ step: "build", packages: ["@mbe/cli"] }])).toBe(
      "bootstrap-worktree: pending — build (@mbe/cli)."
    );
  });

  test("install then build → both, in order", () => {
    expect(
      formatBootstrapDecision([{ step: "install" }, { step: "build", packages: ["@mbe/cli"] }])
    ).toBe("bootstrap-worktree: pending — install, then build (@mbe/cli).");
  });
});

// ---------------------------------------------------------------------------
// ensureWorktreeHooksPath (#9067) — a linked worktree inherits the shared
// core.hooksPath, which can be an absolute path into the MAIN checkout's
// .husky/_, so a branch's own hook edits never run. Real git, real worktree.
// ---------------------------------------------------------------------------

describe("ensureWorktreeHooksPath", () => {
  let sandbox;
  const git = (cwd, ...args) =>
    spawnSync(
      "git",
      [
        "-c",
        "user.email=t@example.com",
        "-c",
        "user.name=t",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, encoding: "utf8" }
    );
  const hook = (dir, marker) => {
    mkdirSync(join(dir, ".husky", "_"), { recursive: true });
    const file = join(dir, ".husky", "_", "pre-commit");
    writeFileSync(file, `#!/bin/sh\necho ${marker} > "$(git rev-parse --show-toplevel)/ran.txt"\n`);
    chmodSync(file, 0o755);
  };

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "wt-hooks-"));
  });
  afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

  function fixture() {
    const main = join(sandbox, "main");
    const wt = join(sandbox, "wt");
    git(sandbox, "init", "-q", "-b", "main", main);
    writeFileSync(join(main, "a.txt"), "a\n");
    git(main, "add", "a.txt");
    git(main, "commit", "-qm", "init");
    hook(main, "MAIN");
    git(main, "config", "core.hooksPath", join(main, ".husky", "_"));
    git(main, "worktree", "add", "-q", "-b", "feat", wt);
    hook(wt, "WORKTREE");
    return { main, wt };
  }

  test("a linked worktree commit runs its own pre-commit, not the main checkout's", () => {
    const { main, wt } = fixture();
    ensureWorktreeHooksPath(wt);
    writeFileSync(join(wt, "b.txt"), "b\n");
    git(wt, "add", "b.txt");
    git(wt, "commit", "-qm", "wt change");
    expect(existsSync(join(wt, "ran.txt"))).toBe(true);
    expect(existsSync(join(main, "ran.txt"))).toBe(false);
  });

  test("leaves the main checkout's hooks path untouched", () => {
    const { main, wt } = fixture();
    ensureWorktreeHooksPath(wt);
    expect(git(main, "config", "--get", "core.hooksPath").stdout.trim()).toBe(
      join(main, ".husky", "_")
    );
    writeFileSync(join(main, "c.txt"), "c\n");
    git(main, "add", "c.txt");
    git(main, "commit", "-qm", "main change");
    expect(existsSync(join(main, "ran.txt"))).toBe(true);
  });

  test("is idempotent and a no-op in the main checkout", () => {
    const { main, wt } = fixture();
    expect(ensureWorktreeHooksPath(wt)).toBe(true);
    expect(ensureWorktreeHooksPath(wt)).toBe(false);
    expect(ensureWorktreeHooksPath(main)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #9111 — `.husky/_` is generated + gitignored, so a fresh worktree lacks it
// and a per-worktree core.hooksPath pointing there leaves hooks silently inert.
// ---------------------------------------------------------------------------

const HUSKY_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "node_modules",
  "husky",
  "bin.js"
);

describe("ensureWorktreeHooksPath without a generated .husky/_ (#9111)", () => {
  let sandbox;
  const git = (cwd, ...args) =>
    spawnSync(
      "git",
      [
        "-c",
        "user.email=t@example.com",
        "-c",
        "user.name=t",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, encoding: "utf8" }
    );
  // Real husky 9 installer, run against the given tree (what `pnpm exec husky` does).
  const realHusky = (dir) => {
    const res = spawnSync(process.execPath, [HUSKY_BIN], { cwd: dir, encoding: "utf8" });
    if (res.status !== 0) throw new Error(res.stderr);
  };

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "wt-hooks-9111-"));
  });
  afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

  // main has a TRACKED .husky/pre-commit and an installed .husky/_; the linked
  // worktree has the tracked hook but no generated .husky/_.
  function fixture() {
    const main = join(sandbox, "main");
    const wt = join(sandbox, "wt");
    git(sandbox, "init", "-q", "-b", "main", main);
    mkdirSync(join(main, ".husky"), { recursive: true });
    const hookFile = join(main, ".husky", "pre-commit");
    writeFileSync(hookFile, '#!/bin/sh\necho RAN > "$(git rev-parse --show-toplevel)/ran.txt"\n');
    chmodSync(hookFile, 0o755);
    writeFileSync(join(main, "a.txt"), "a\n");
    git(main, "add", ".");
    git(main, "commit", "-qm", "init");
    realHusky(main);
    git(main, "worktree", "add", "-q", "-b", "feat", wt);
    expect(existsSync(join(wt, ".husky", "_"))).toBe(false);
    return { main, wt };
  }

  test("a fresh worktree ends with an existing hooks dir and commits run its own pre-commit", () => {
    const { main, wt } = fixture();
    expect(ensureWorktreeHooksPath(wt, { installHooks: realHusky, warn: () => {} })).toBe(true);
    expect(existsSync(join(wt, ".husky", "_"))).toBe(true);
    expect(hooksActive(wt)).toBe(true);
    writeFileSync(join(wt, "b.txt"), "b\n");
    git(wt, "add", "b.txt");
    git(wt, "commit", "-qm", "wt change");
    expect(existsSync(join(wt, "ran.txt"))).toBe(true);
    expect(existsSync(join(main, "ran.txt"))).toBe(false);
  });

  test("the main checkout keeps working and its tree is untouched", () => {
    const { main, wt } = fixture();
    const before = git(main, "status", "--porcelain").stdout;
    ensureWorktreeHooksPath(wt, { installHooks: realHusky, warn: () => {} });
    expect(git(main, "status", "--porcelain").stdout).toBe(before);
    expect(hooksActive(main)).toBe(true);
    writeFileSync(join(main, "c.txt"), "c\n");
    git(main, "add", "c.txt");
    git(main, "commit", "-qm", "main change");
    expect(existsSync(join(main, "ran.txt"))).toBe(true);
  });

  test("falls back to the inherited hooks path and warns loudly when .husky/_ cannot be created", () => {
    const { wt } = fixture();
    const warnings = [];
    const result = ensureWorktreeHooksPath(wt, {
      installHooks: () => {
        throw new Error("husky exploded");
      },
      warn: (msg) => warnings.push(msg),
    });
    expect(result).toBe(false);
    expect(git(wt, "config", "--worktree", "--get", "core.hooksPath").stdout.trim()).toBe("");
    expect(warnings.join("\n")).toMatch(/hooks .*(inert|not|inherit)/i);
  });

  test("retries a git config write that hits `could not lock config file`", () => {
    const { wt } = fixture();
    const lock = join(
      git(wt, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim(),
      "config.lock"
    );
    let sleeps = 0;
    const result = ensureWorktreeHooksPath(wt, {
      // Lock appears after husky ran, i.e. contention on our own config writes.
      installHooks: (dir) => {
        realHusky(dir);
        writeFileSync(lock, "");
      },
      warn: () => {},
      sleep: () => {
        sleeps += 1;
        rmSync(lock, { force: true });
      },
    });
    expect(sleeps).toBeGreaterThan(0);
    expect(result).toBe(true);
    expect(git(wt, "config", "--worktree", "--get", "core.hooksPath").stdout.trim()).toBe(
      ".husky/_"
    );
  });
});

describe("hooksActive", () => {
  test("is false for a directory that is not a git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "wt-hooks-nogit-"));
    try {
      expect(hooksActive(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
