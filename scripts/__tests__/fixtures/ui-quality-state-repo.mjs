/**
 * Test fixture for the ui-quality loop state channel (state.mjs): a temp bare
 * `origin` plus clones, seeded with the files the routine reads and writes.
 * The "router source" is `routes.json` — `ledgerRunner` backs `ledger.mjs`'s
 * inventory with it, so a router change on `main` is a `routes.json` edit
 * plus a `ledger.mjs generate`, exactly the regen main's CI enforces.
 *
 * Not a test file (no `.test.mjs`); imported by ui-quality-state*.test.mjs.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main as ledgerMain } from "../../ui-quality/ledger.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const MODEL_ID = "claude-opus-5";
export const LEDGER = "metrics/ui-quality-ledger.jsonl";
export const FINDINGS = "metrics/ui-quality-findings.json";
export const CALIBRATIONS = "metrics/ui-quality-calibrations.jsonl";
export const BACKLOG = "docs/backlog.md";

/** Run git in `cwd` with hooks off and a fixed identity; returns trimmed stdout. */
export function git(cwd, args) {
  return execFileSync(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "init.defaultBranch=main",
      ...args,
    ],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

export function writeRel(root, rel, content) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export const readRel = (root, rel) => readFileSync(join(root, rel), "utf8");

/** `count` public marketing page routes, each with its own source file. */
export function pageRoutes(count, prefix = "page") {
  return Array.from({ length: count }, (_, i) => {
    const route = `${prefix}-${String(i).padStart(2, "0")}`;
    return {
      route,
      app: "marketing",
      kind: "page",
      auth: "public",
      source_files: [`apps/marketing/src/pages/${route}.tsx`],
    };
  });
}

const quiet = () => {};

/**
 * `ledger.mjs` over `routes.json` in `root` — the injected inventory. Returns
 * the exit code, as state.mjs's `ledger` dep does.
 */
export function ledgerRunner(root, overrides = {}) {
  return (command, extraArgs = []) =>
    ledgerMain([command, ...extraArgs, "--root", root], {
      inventory: () => JSON.parse(readRel(root, "routes.json")),
      lastChangedAt: () => "2026-09-01T00:00:00Z",
      gitDepth: () => "full",
      stdout: quiet,
      stderr: quiet,
      ...overrides,
    });
}

/**
 * A bare `origin` whose `main` holds the seeded state, and a clone factory.
 * @returns {{ base: string, remote: string, clone: (name: string) => string }}
 */
export function createStateRemote({ routes = pageRoutes(45) } = {}) {
  const base = mkdtempSync(join(tmpdir(), "ui-quality-state-"));
  const remote = join(base, "origin.git");
  git(base, ["init", "--bare", "--initial-branch=main", remote]);
  const seed = join(base, "seed");
  git(base, ["clone", "--quiet", remote, seed]);
  writeRel(seed, ".gitattributes", readFileSync(join(REPO, ".gitattributes"), "utf8"));
  writeRel(seed, "docs/ui-quality/rubric.json", readRel(REPO, "docs/ui-quality/rubric.json"));
  writeRel(
    seed,
    "docs/ui-quality/calibration.json",
    JSON.stringify({ labelled_at: null, labelled_by: null, pairs: [] }, null, 2) + "\n"
  );
  writeRel(
    seed,
    BACKLOG,
    "# Seed backlog\n\n- a seed already on main (from: session:2026-09-01)\n"
  );
  writeRel(seed, "README.md", "fixture\n");
  writeRel(seed, "routes.json", JSON.stringify(routes, null, 2) + "\n");
  writeRel(seed, FINDINGS, "{}\n");
  for (const metric of ["calibrations", "ratings", "runs"]) {
    writeRel(seed, `metrics/ui-quality-${metric}.jsonl`, "");
  }
  writeRel(seed, ".claude/improvement-loop/log.md", "# Improvement loop log\n");
  if (ledgerRunner(seed)("generate") !== 0) throw new Error("fixture: ledger generate failed");
  git(seed, ["add", "-A"]);
  git(seed, ["commit", "--quiet", "-m", "seed"]);
  git(seed, ["push", "--quiet", "origin", "main"]);
  const clone = (name) => {
    const dir = join(base, name);
    git(base, ["clone", "--quiet", remote, dir]);
    // state.mjs runs plain `git` (no -c identity), as the sandbox does.
    git(dir, ["config", "user.name", "Fixture"]);
    git(dir, ["config", "user.email", "fixture@example.invalid"]);
    return dir;
  };
  return { base, remote, clone };
}

/** Commit every change in `dir` and push `branch` to origin. */
export function commitAndPush(dir, message, branch) {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "--quiet", "-m", message]);
  git(dir, ["push", "--quiet", "origin", `HEAD:refs/heads/${branch}`]);
}

/** The remote's sha for `branch`, or null when it does not exist. */
export function remoteSha(remote, branch) {
  try {
    return git(remote, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  } catch {
    return null;
  }
}
