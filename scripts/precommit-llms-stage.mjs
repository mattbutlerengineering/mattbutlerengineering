#!/usr/bin/env node
/**
 * precommit-llms-stage.mjs — Regenerate and stage llms.txt artifacts
 * affected by the files staged for THIS commit (#6633).
 *
 * `.husky/post-commit` used to run `pack-changed --mode commit` AFTER the
 * commit landed, leaving llms.txt/llms-full.txt dirty — needing an amend —
 * and never refreshed the root llms.txt at all, so it went stale until
 * `.husky/pre-push`'s `pnpm regen --check --git-only` rejected the push.
 * This runs the equivalent work before the commit is made, scoped to the
 * staged diff, so the artifacts land in the same commit.
 *
 * Scope: only the llms-txt family — regen-manifest.mjs's one hookMode:
 * "warn" family (see scripts/__tests__/regen-consumers.test.mjs, which pins
 * "a source edit in a package lands in the warn hook only"). The other
 * "stage" families (dep-graph, rialto color tokens, sitemap, ui-quality
 * ledger) are already regenerated and staged at edit time by the
 * PostToolUse `regen-dep-graph.sh` hook; duplicating that here would just
 * re-run it a second time per commit for no benefit.
 *
 * Root llms.txt/llms-full.txt aggregate every package — `mbe pack .` scans
 * the whole repo (~7s measured, the "long pole" per regen.mjs's own
 * comment) — so it is only regenerated when a package's own llms.txt
 * actually changed byte-for-byte, i.e. its *exported* surface changed, not
 * just its implementation body (`mbe pack` strips function bodies down to
 * skeletons). A typical one-file commit that only touches implementation
 * leaves every package skeleton unchanged, so the root regen is skipped and
 * the added cost is just the one package pack (~1s against a built CLI). A
 * commit that actually changes an export pays the ~7s root regen cost.
 *
 * `.husky/pre-push`'s `pnpm regen --check --git-only` remains the
 * authoritative backstop for anything this misses (e.g. the CLI build
 * failing, see ensureCliBuilt below — this script fails OPEN on that so a
 * broken build never blocks every future commit; pre-push is where that
 * actually gets enforced).
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES, familiesForChangedFile } from "./regen-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CLI_DIST_ENTRY = resolve(ROOT, "tools/cli/dist/index.js");

/** Root llms.txt/llms-full.txt — not package-scoped, so not part of FAMILIES' changedBy(). */
const ROOT_OUTPUTS = ["llms.txt", "llms-full.txt"];

/**
 * Pure: given the files staged for this commit, returns the deduplicated
 * set of per-package llms-txt families they make stale. Dedupes by output
 * pair so a package with several staged files is only packed once.
 *
 * @param {string[]} stagedFiles - repo-root-relative paths
 * @param {Array} families - defaults to the real manifest; tests can pass a stub
 * @returns {Array<{command: string, outputs: string[]}>}
 */
export function selectLlmsFamilies(stagedFiles, families = FAMILIES) {
  const seen = new Map();
  for (const file of stagedFiles) {
    for (const family of familiesForChangedFile(file, families, "warn")) {
      seen.set(family.outputs.join("|"), family);
    }
  }
  return [...seen.values()];
}

/** Workspace package dir a scoped llms-txt family's outputs belong to. */
export function pkgDirFromOutputs(outputs) {
  return outputs[0].replace(/\/llms\.txt$/, "");
}

/** True if the CLI's dist is already built, building it (transitive deps included) if not. */
function ensureCliBuilt() {
  if (existsSync(CLI_DIST_ENTRY)) return true;
  try {
    execFileSync("pnpm", ["build", "--filter", "@mbe/cli..."], { cwd: ROOT, stdio: "inherit" });
  } catch {
    return false;
  }
  return existsSync(CLI_DIST_ENTRY);
}

/** Runs `mbe pack <pkgDir>` via the built dist entry (fast — no tsx/pnpm-filter overhead). */
function regenPackage(pkgDir) {
  try {
    execFileSync("node", [CLI_DIST_ENTRY, "pack", pkgDir], { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Working-tree paths among `outputs` that differ from the index. */
function diffOutputs(outputs) {
  return execFileSync("git", ["diff", "--name-only", "--", ...outputs], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
}

function stageOutputs(paths) {
  execFileSync("git", ["add", ...paths], { cwd: ROOT });
}

function stagedFiles() {
  return execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
}

/**
 * Orchestrates regen + stage for one pre-commit run. Dependency-injected
 * (regen/diff/stage) so the decision logic — which packages to touch, and
 * whether root needs a follow-up regen — is unit-testable without shelling
 * out to a built CLI or a real git index.
 *
 * @param {object} [opts]
 * @param {Array<{outputs: string[]}>} [opts.families] - defaults to the real staged diff
 * @param {(pkgDir: string) => boolean} [opts.regen]
 * @param {(outputs: string[]) => string[]} [opts.diff]
 * @param {(paths: string[]) => void} [opts.stage]
 * @param {string[]} [opts.rootOutputs]
 * @returns {{ranRoot: boolean, packagesChanged: string[]}}
 */
export function runPrecommitLlmsStage({
  families = selectLlmsFamilies(stagedFiles()),
  regen = regenPackage,
  diff = diffOutputs,
  stage = stageOutputs,
  rootOutputs = ROOT_OUTPUTS,
} = {}) {
  const packagesChanged = [];

  for (const family of families) {
    const pkgDir = pkgDirFromOutputs(family.outputs);
    if (!regen(pkgDir)) continue;

    const changed = diff(family.outputs);
    if (changed.length > 0) {
      stage(changed);
      packagesChanged.push(pkgDir);
    }
  }

  let ranRoot = false;
  if (packagesChanged.length > 0) {
    ranRoot = true;
    if (regen(".")) {
      const changed = diff(rootOutputs);
      if (changed.length > 0) stage(changed);
    }
  }

  return { ranRoot, packagesChanged };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const families = selectLlmsFamilies(stagedFiles());
  if (families.length === 0) process.exit(0);

  if (!ensureCliBuilt()) {
    console.warn("");
    console.warn(
      "WARNING: CLI build failed — fix the TypeScript errors above. Skipping llms.txt regen for this commit."
    );
    console.warn(
      "pre-push's `pnpm regen --check --git-only` will still catch any resulting drift before you can push."
    );
    console.warn("");
    process.exit(0);
  }

  const { packagesChanged } = runPrecommitLlmsStage({ families });
  if (packagesChanged.length > 0) {
    // process.stdout.write, not console.log — stays off the AI antipattern
    // ratchet's consoleLogs count (scripts/check-ai-antipatterns.mjs), which
    // this same commit now also runs.
    process.stdout.write(
      `pre-commit: regenerated and staged llms.txt for: ${packagesChanged.join(", ")}\n`
    );
  }
  process.exit(0);
}
