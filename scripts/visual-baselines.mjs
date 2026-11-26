#!/usr/bin/env node

/**
 * visual-baselines.mjs — visual-regression baselines derived from `main`,
 * stored outside the tracked tree.
 *
 * A push to `main` captures the visual suite with `--update-snapshots=all`
 * and publishes the PNGs as ONE orphan commit on a ref only that suite and
 * main commit name: `visual-baselines/<suite>/<sha>`. A pull request's visual
 * job fetches the baseline of the nearest first-parent ancestor of
 * `origin/main` that has one, and plants it into the suite's
 * `snapshotPathTemplate` folder before Playwright runs. Merging the PR is the
 * approval: the next main push publishes its screenshots as the new baseline,
 * so no "regenerate visual baselines" PR is needed.
 *
 * Same storage rules as `visual-diff-refs.mjs`: one ref per writer, nothing
 * ever overwrites a ref, `--force` is never used. Retention is `planBaselineSweep`
 * below (#9703) — `visual-diff-refs.mjs`'s `main()` lists this namespace
 * alongside `visual-diffs/**` and applies it, keeping the newest `DEFAULT_DEPTH`
 * refs per suite by commit date.
 *
 * Runs with bare `node` and no `node_modules`. Every shell-out is
 * `execFileSync` with an argv array.
 *
 * CLI:
 *   node scripts/visual-baselines.mjs publish --suite <s> --dir <d> --sha <sha>
 *   node scripts/visual-baselines.mjs fetch   --suite <s> --dir <d> [--base origin/main] [--depth 50]
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildOrphanCommit } from "./publish-visual-diffs.mjs";
import { MIN_AGE_HOURS, REF_ROOT, ageHours } from "./visual-diff-refs.mjs";

/** Branch-name prefix. Must never match a workflow `push:` filter
 * (`visual-diff-ref-trigger-safety.test.mjs` checks this namespace too). */
export const BASELINE_PREFIX = "visual-baselines";

/** How many first-parent ancestors of the base a PR searches. */
export const DEFAULT_DEPTH = 50;

const SUITE_PATTERN = /^[a-z][a-z0-9-]*$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REF_NAME_PATTERN = new RegExp(`^${BASELINE_PREFIX}/([a-z][a-z0-9-]*)/([0-9a-f]{40})$`);

/** @returns {string} `visual-baselines/<suite>/<sha>` */
export function buildBaselineRefName({ suite, sha }) {
  if (!SUITE_PATTERN.test(suite ?? "")) throw new Error(`invalid suite: ${suite}`);
  if (!SHA_PATTERN.test(sha ?? "")) throw new Error(`invalid sha (need 40 hex chars): ${sha}`);
  return `${BASELINE_PREFIX}/${suite}/${sha}`;
}

/** @returns {{suite: string, sha: string} | null} */
export function parseBaselineRefName(name) {
  const match = REF_NAME_PATTERN.exec(name ?? "");
  return match ? { suite: match[1], sha: match[2] } : null;
}

/** Baseline ref names from `git ls-remote` output, without the ref root. */
export function parseLsRemote(output) {
  const prefix = `${REF_ROOT}/`;
  return output
    .split("\n")
    .map((line) => line.split("\t")[1] ?? "")
    .filter((ref) => ref.startsWith(prefix))
    .map((ref) => ref.slice(prefix.length))
    .filter((name) => parseBaselineRefName(name) !== null);
}

/**
 * The nearest ancestor (in the order given, nearest first) holding a baseline
 * for `suite`, or `null`.
 *
 * @returns {{sha: string, refName: string, distance: number} | null}
 */
export function pickBaseline({ suite, ancestors, refNames }) {
  const available = new Set(
    refNames
      .map(parseBaselineRefName)
      .filter((parsed) => parsed?.suite === suite)
      .map((parsed) => parsed.sha)
  );
  const distance = ancestors.findIndex((sha) => available.has(sha));
  if (distance === -1) return null;
  const sha = ancestors[distance];
  return { sha, refName: buildBaselineRefName({ suite, sha }), distance };
}

/**
 * Pure: the keep/delete verdict for the visual-baselines/ namespace — the
 * retention #9696 left unwired (see the module docstring).
 *
 * Mirrors {@link planRefSweep}'s shape ({toDelete, retained}, one verdict per
 * ref, every entry carrying a `reason`), but groups per SUITE rather than per
 * PR: a baseline ref carries no PR, only a suite and the main commit it was
 * published for. A PR only ever READS this namespace (`fetchBaseline` /
 * `pickBaseline`, searching `depth` first-parent ancestors), so a ref beyond
 * rank `keep` can never be picked by one and is safe to retire.
 *
 * Both overrides are decided BEFORE ranking, so neither one occupies a `keep`
 * slot or displaces an older, dated ref out of them:
 *   - a ref younger than `minAgeHours` — its publish may still be in flight;
 *   - a ref whose date is unreadable — failing to date it must never be read
 *     as a reason to delete it, the same rule {@link planRefSweep} enforces.
 *
 * A name {@link parseBaselineRefName} cannot read is never selected, same
 * fail-safe direction as the other namespace.
 *
 * @param {{refs?: Array<{name:string, committedAt:string|null}>, now?: Date,
 *          keep?: number, minAgeHours?: number}} input
 * @returns {{toDelete: Array<object>, retained: Array<object>}}
 */
export function planBaselineSweep({
  refs,
  now = new Date(),
  keep = DEFAULT_DEPTH,
  minAgeHours = MIN_AGE_HOURS,
}) {
  const bySuite = new Map();
  const retained = [];

  for (const refEntry of refs ?? []) {
    const parsed = parseBaselineRefName(refEntry.name);
    if (parsed === null) {
      retained.push({ ...refEntry, reason: "unparsable" });
      continue;
    }

    const age = ageHours(refEntry.committedAt, now);
    if (age === null) {
      retained.push({ ...refEntry, ...parsed, reason: "undated" });
      continue;
    }
    if (age < minAgeHours) {
      retained.push({ ...refEntry, ...parsed, reason: "too-recent" });
      continue;
    }

    const group = bySuite.get(parsed.suite) ?? [];
    group.push({ ref: refEntry, parsed, age });
    bySuite.set(parsed.suite, group);
  }

  const toDelete = [];
  for (const group of bySuite.values()) {
    group.sort((a, b) => a.age - b.age); // newest (smallest age) first
    group.forEach(({ ref: refEntry, parsed }, index) => {
      const verdict = { ...refEntry, ...parsed };
      if (index < keep) {
        retained.push({ ...verdict, reason: "newest" });
      } else {
        toDelete.push({ ...verdict, reason: "old" });
      }
    });
  }

  return { toDelete, retained };
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function pngNames(dir) {
  return readdirSync(dir).filter((name) => name.endsWith(".png"));
}

/** Push `dir`'s PNGs as the baseline for `sha`. Never touches the work tree. */
export function publishBaseline({ dir, suite, sha, cwd, remote = "origin" }) {
  const refName = buildBaselineRefName({ suite, sha });
  const files = pngNames(dir).map((name) => ({ name, path: join(dir, name) }));
  if (files.length === 0)
    throw new Error(`no PNG files in ${dir}; refusing to publish an empty baseline`);
  const commit = buildOrphanCommit({ files, message: `visual baseline: ${suite} @ ${sha}`, cwd });
  git(["push", "-q", remote, `${commit}:${REF_ROOT}/${refName}`], cwd);
  return { refName, commit, count: files.length };
}

/**
 * Overwrite `dir`'s PNGs with the nearest ancestor's baseline. Returns `null`
 * and leaves `dir` untouched when no ancestor within `depth` has one, so the
 * tracked PNGs stay in force during the migration.
 */
export function fetchBaseline({
  dir,
  suite,
  base = "origin/main",
  cwd,
  remote = "origin",
  depth = DEFAULT_DEPTH,
}) {
  const ancestors = git(["rev-list", "--first-parent", "-n", String(depth), base], cwd)
    .split("\n")
    .filter(Boolean);
  const refNames = parseLsRemote(
    git(["ls-remote", remote, `${REF_ROOT}/${BASELINE_PREFIX}/${suite}/*`], cwd)
  );
  const picked = pickBaseline({ suite, ancestors, refNames });
  if (!picked) return null;

  git(["fetch", "-q", "--depth=1", remote, `${REF_ROOT}/${picked.refName}`], cwd);
  const commit = git(["rev-parse", "FETCH_HEAD"], cwd);

  const names = git(["ls-tree", "--name-only", commit], cwd).split("\n").filter(Boolean);
  // Overwrite only what the baseline holds: a PNG the PR itself adds has no
  // baseline yet and must survive, or its new test reports a missing snapshot.
  const archiveDir = mkdtempSync(join(tmpdir(), "visual-baseline-archive-"));
  try {
    const tarPath = join(archiveDir, "baseline.tar");
    git(["archive", "--format=tar", "-o", tarPath, commit], cwd);
    execFileSync("tar", ["-xf", tarPath, "-C", dir]);
  } finally {
    rmSync(archiveDir, { recursive: true, force: true });
  }
  return { ...picked, commit, count: names.length };
}

function summary(line) {
  process.stdout.write(`${line}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

function main(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      suite: { type: "string" },
      dir: { type: "string" },
      sha: { type: "string" },
      base: { type: "string", default: "origin/main" },
      depth: { type: "string", default: String(DEFAULT_DEPTH) },
    },
  });
  const [command] = positionals;
  if (!values.suite || !values.dir) throw new Error("--suite and --dir are required");

  if (command === "publish") {
    const result = publishBaseline({ dir: values.dir, suite: values.suite, sha: values.sha });
    summary(`Published ${result.count} baseline PNGs to \`${result.refName}\`.`);
    return;
  }
  if (command === "fetch") {
    const result = fetchBaseline({
      dir: values.dir,
      suite: values.suite,
      base: values.base,
      depth: Number(values.depth),
    });
    summary(
      result
        ? `Using ${result.count} baseline PNGs from \`${result.refName}\` (${result.distance} commits behind ${values.base}).`
        : `No published baseline within ${values.depth} commits of ${values.base}; using the tracked PNGs.`
    );
    return;
  }
  throw new Error(`unknown command: ${command ?? "(none)"}; expected publish or fetch`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`visual-baselines: ${error.message}`);
    process.exit(1);
  }
}
