#!/usr/bin/env node
/**
 * ledger.mjs — owns `metrics/ui-quality-ledger.jsonl` and every question asked
 * of it (docs/features/ui-quality-loop/architecture.md § Components "Coverage
 * ledger", § Interfaces `ledger.mjs`).
 *
 * One row per route template, sorted by (app, route):
 *
 *   identity (generated from source by routes.mjs): route, app, kind, auth, source_files
 *   audit    (preserved across regeneration):       last_changed_at, last_audited_at,
 *                                                    rubric_version, reachability
 *
 * `last_changed_at` is set for NEW rows at `generate` and recomputed only by
 * `refresh` — regenerating it on every PR would put every UI PR on the
 * llms-treadmill (architecture § Decisions).
 *
 * Subcommands:
 *   generate  rewrite the ledger: identity from the inventory, audit columns preserved
 *   check     exit 1 when the regenerated identity set ≠ committed; never rewrites
 *   refresh   recompute `last_changed_at` for every row (unchanged where git is unavailable)
 *   due       write .ui-quality/plan.json (capture's input, `{ app → [{ route, path,
 *             viewports }] }`) and .ui-quality/due.json (record's input: the whole due
 *             set incl. no-fixture rows, plus the auth0 rows); mark auth0 rows
 *             `unreachable:auth` in the same ledger write
 *   record    apply .ui-quality/captures/<app>/manifest.jsonl +
 *             .ui-quality/judge-status.json to every due row, append the runs row
 *
 * `due` and `record` read the current `rubric_version` from
 * docs/ui-quality/rubric.json through rubric.mjs (an unreadable or invalid
 * rubric exits 2). `due` plans under it and writes it into due.json; `record`
 * refuses (exit 2, writes nothing) when the rubric changed since — the judge
 * read one bar and the ledger would stamp another. There is no
 * `--rubric-version` flag; passing the retired one exits 2.
 *
 * Pure core (`buildLedger`, `diffIdentity`, `parseLedger`, `renderLedger`) plus a
 * `main(argv, deps)` whose deps (`inventory`, `lastChangedAt`, `gitDepth`, fs
 * root) default to the real repo. Exit codes: 0 ok, 1 check failed, 2 bad input.
 *
 * Usage: node scripts/ui-quality/ledger.mjs <generate|check|refresh|due|record> [--root <dir>]
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { append, resolvePath } from "../metrics-store.mjs";
import { AUDIT_TTL_DAYS, MAX_ROUTES_PER_FIRE, VIEWPORTS } from "./config.mjs";
import { applyRecord, buildPlan, markUnreachableAuth, selectDue } from "./ledger-audit.mjs";
import { createRepoIo, extractAll } from "./routes.mjs";
import { loadRubric } from "./rubric.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const LEDGER_METRIC = "ui-quality-ledger";
export const RUNS_METRIC = "ui-quality-runs";

/** The gitignored per-fire work dir and the files in it this module reads or writes. */
export const WORK_DIR = ".ui-quality";
const PLAN_FILE = "plan.json";
const DUE_FILE = "due.json";
const JUDGE_STATUS_FILE = "judge-status.json";
const CAPTURES_DIR = "captures";
const FIXTURES_FILE = "scripts/ui-quality/route-fixtures.json";

export const IDENTITY_COLUMNS = ["route", "app", "kind", "auth", "source_files"];
export const AUDIT_COLUMNS = [
  "last_changed_at",
  "last_audited_at",
  "rubric_version",
  "reachability",
];
export const LEDGER_COLUMNS = [...IDENTITY_COLUMNS, ...AUDIT_COLUMNS];

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

const keyOf = (row) => `${row.app}|${row.route}`;

function byAppRoute(a, b) {
  if (a.app !== b.app) return a.app < b.app ? -1 : 1;
  return a.route < b.route ? -1 : a.route > b.route ? 1 : 0;
}

/** Fixed column order, so a row renders identically whoever built it. */
function orderColumns(row) {
  return Object.fromEntries(LEDGER_COLUMNS.map((col) => [col, row[col] ?? null]));
}

/** @param {string} text JSONL @returns {object[]} */
export function parseLedger(text) {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

/** @param {object[]} rows @returns {string} JSONL with a trailing newline */
export function renderLedger(rows) {
  return rows.map((r) => JSON.stringify(orderColumns(r))).join("\n") + "\n";
}

/**
 * The ledger for `routes`, carrying audit state over from `committed` rows of
 * the same (app, route). A new row's `last_changed_at` comes from
 * `lastChangedAt(source_files)`; rows for vanished routes are dropped.
 */
export function buildLedger(routes, committed, { lastChangedAt }) {
  const prior = new Map(committed.map((row) => [keyOf(row), row]));
  return routes
    .map((route) => {
      const old = prior.get(keyOf(route));
      const identity = Object.fromEntries(IDENTITY_COLUMNS.map((c) => [c, route[c]]));
      const audit = old
        ? Object.fromEntries(AUDIT_COLUMNS.map((c) => [c, old[c] ?? null]))
        : {
            last_changed_at: lastChangedAt(route.source_files),
            last_audited_at: null,
            rubric_version: null,
            reachability: null,
          };
      return orderColumns({ ...identity, ...audit });
    })
    .sort(byAppRoute);
}

/**
 * Identity-column differences between the inventory and the committed rows.
 * @returns {{ added: object[], removed: object[], changed: object[] }}
 */
export function diffIdentity(routes, committed) {
  const identity = (row) => JSON.stringify(IDENTITY_COLUMNS.map((c) => row[c]));
  const want = new Map(routes.map((r) => [keyOf(r), r]));
  const have = new Map(committed.map((r) => [keyOf(r), r]));
  return {
    added: routes.filter((r) => !have.has(keyOf(r))),
    removed: committed.filter((r) => !want.has(keyOf(r))),
    changed: routes.filter(
      (r) => have.has(keyOf(r)) && identity(have.get(keyOf(r))) !== identity(r)
    ),
  };
}

// ---------------------------------------------------------------------------
// Real git binding
// ---------------------------------------------------------------------------

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** "full" | "shallow" | "unknown" */
export function createGitDepth(root) {
  return () => {
    try {
      return git(root, ["rev-parse", "--is-shallow-repository"]) === "true" ? "shallow" : "full";
    } catch {
      return "unknown";
    }
  };
}

const toUtc = (iso) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * `git log -1 --format=%cI` over the route's own files. In a shallow clone the
 * history is truncated, so every row degrades to the HEAD commit date — an
 * upper bound: the route reads as due sooner, never later. No git → null.
 */
export function createLastChangedAt(root, gitDepth = createGitDepth(root)) {
  return (files) => {
    const depth = gitDepth();
    if (depth === "unknown") return null;
    try {
      const own = depth === "full" ? git(root, ["log", "-1", "--format=%cI", "--", ...files]) : "";
      return toUtc(own || git(root, ["log", "-1", "--format=%cI"]));
    } catch {
      return null;
    }
  };
}

// ---------------------------------------------------------------------------
// CLI body — each command gets `ctx`: deps + root + argv + ledgerPath
// ---------------------------------------------------------------------------

function readCommitted(path) {
  return existsSync(path) ? parseLedger(readFileSync(path, "utf8")) : null;
}

function readJsonIfPresent(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function requireLedger(ctx) {
  const rows = readCommitted(ctx.ledgerPath);
  if (rows === null) throw new Error(`${ctx.ledgerPath} is missing — run generate first`);
  return rows;
}

function generate(ctx) {
  const routes = ctx.inventory();
  const committed = readCommitted(ctx.ledgerPath) ?? [];
  const rows = buildLedger(routes, committed, { lastChangedAt: ctx.lastChangedAt });
  writeFileSync(ctx.ledgerPath, renderLedger(rows));
  ctx.stderr(`ledger.mjs generate: ${rows.length} rows (git_depth: ${ctx.gitDepth()})\n`);
  return 0;
}

function check(ctx) {
  const committed = readCommitted(ctx.ledgerPath);
  if (committed === null) {
    ctx.stdout(
      `FAIL: ${ctx.ledgerPath} is missing — run: node scripts/ui-quality/ledger.mjs generate\n`
    );
    return 1;
  }
  const routes = ctx.inventory();
  const { added, removed, changed } = diffIdentity(routes, committed);
  const lines = [
    ...added.map((r) => `  added:   ${r.app} ${r.route}`),
    ...removed.map((r) => `  removed: ${r.app} ${r.route}`),
    ...changed.map((r) => `  changed: ${r.app} ${r.route}`),
  ];
  const rerendered = renderLedger(buildLedger(routes, committed, { lastChangedAt: () => null }));
  if (lines.length === 0 && rerendered !== readFileSync(ctx.ledgerPath, "utf8")) {
    lines.push("  order/format differs from a regenerated ledger");
  }
  if (lines.length === 0) {
    ctx.stdout(`PASS: ui-quality ledger matches the route inventory (${committed.length} rows)\n`);
    return 0;
  }
  ctx.stdout(
    `FAIL: ui-quality ledger is stale — run: node scripts/ui-quality/ledger.mjs generate\n${lines.join("\n")}\n`
  );
  return 1;
}

function refresh(ctx) {
  const rows = requireLedger(ctx).map((r) => ({
    ...r,
    last_changed_at: ctx.lastChangedAt(r.source_files) ?? r.last_changed_at,
  }));
  writeFileSync(ctx.ledgerPath, renderLedger(rows));
  ctx.stderr(`ledger.mjs refresh: ${rows.length} rows (git_depth: ${ctx.gitDepth()})\n`);
  return 0;
}

function due(ctx) {
  const rows = requireLedger(ctx);
  const rubricVersion = loadRubric(ctx.root).rubric_version;
  const { due: dueRows, unreachableAuth } = selectDue(rows, {
    rubricVersion,
    now: ctx.now(),
    ttlDays: AUDIT_TTL_DAYS,
    maxRoutes: MAX_ROUTES_PER_FIRE,
    fixtures: ctx.fixtures ?? readJsonIfPresent(join(ctx.root, FIXTURES_FILE)) ?? {},
  });
  const work = join(ctx.root, WORK_DIR);
  writeJson(join(work, PLAN_FILE), buildPlan(dueRows, VIEWPORTS));
  writeJson(join(work, DUE_FILE), {
    at: ctx.now(),
    git_depth: ctx.gitDepth(),
    rubric_version: rubricVersion,
    due: dueRows,
    unreachable_auth: unreachableAuth,
  });
  writeFileSync(ctx.ledgerPath, renderLedger(markUnreachableAuth(rows, unreachableAuth)));
  for (const d of dueRows.filter((r) => r.detail === "no-fixture")) {
    ctx.stderr(`ledger.mjs due: no-fixture — ${d.app} ${d.route} planned unreachable:build\n`);
  }
  ctx.stderr(`ledger.mjs due: ${dueRows.length} due, ${unreachableAuth.length} unreachable:auth\n`);
  return 0;
}

/** app → manifest rows, from every .ui-quality/captures/<app>/manifest.jsonl present. */
function readManifests(work) {
  const dir = join(work, CAPTURES_DIR);
  if (!existsSync(dir)) return {};
  const manifests = {};
  for (const app of readdirSync(dir).sort()) {
    const file = join(dir, app, "manifest.jsonl");
    if (existsSync(file)) manifests[app] = parseLedger(readFileSync(file, "utf8"));
  }
  return manifests;
}

function record(ctx) {
  if (ctx.argv.includes("--rubric-version")) {
    throw new Error(
      "--rubric-version is retired — the version is read from docs/ui-quality/rubric.json"
    );
  }
  const rubricVersion = loadRubric(ctx.root).rubric_version;
  const work = join(ctx.root, WORK_DIR);
  const dueFile = readJsonIfPresent(join(work, DUE_FILE));
  if (dueFile === null) throw new Error(`${WORK_DIR}/${DUE_FILE} is missing — run due first`);
  if (dueFile.rubric_version !== rubricVersion) {
    throw new Error(
      `${WORK_DIR}/${DUE_FILE} was planned under rubric_version ${dueFile.rubric_version} but docs/ui-quality/rubric.json is now ${rubricVersion} — the rubric changed mid-fire; nothing recorded`
    );
  }
  const judgeStatus = readJsonIfPresent(join(work, JUDGE_STATUS_FILE));
  if (judgeStatus === null) {
    ctx.stderr(
      `ledger.mjs record: ${WORK_DIR}/${JUDGE_STATUS_FILE} is missing — every captured row is unjudged:missing, none audited\n`
    );
  }
  const now = ctx.now();
  const { rows, counts } = applyRecord(requireLedger(ctx), {
    dueFile,
    manifests: readManifests(work),
    judgeStatus,
    now,
    rubricVersion,
  });
  writeFileSync(ctx.ledgerPath, renderLedger(rows));
  append(
    RUNS_METRIC,
    { ts: now, ...counts, git_depth: dueFile.git_depth, rubric_version: rubricVersion },
    { root: ctx.root }
  );
  ctx.stderr(`ledger.mjs record: ${JSON.stringify(counts)}\n`);
  return 0;
}

const COMMANDS = { generate, check, refresh, due, record };

const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * @param {string[]} argv
 * @param {object} [deps] root, inventory, lastChangedAt, gitDepth, now, fixtures, stdout, stderr
 * @returns {number} exit code
 */
export function main(argv, deps = {}) {
  const rootFlag = argv.indexOf("--root");
  const root = rootFlag !== -1 ? resolve(argv[rootFlag + 1]) : (deps.root ?? DEFAULT_ROOT);
  const gitDepth = deps.gitDepth ?? createGitDepth(root);
  const ctx = {
    inventory: () => extractAll(createRepoIo(root)),
    lastChangedAt: createLastChangedAt(root, gitDepth),
    now: isoNow,
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    ...deps,
    gitDepth,
    root,
    argv,
    ledgerPath: resolvePath(LEDGER_METRIC, { root }),
  };
  const command = COMMANDS[argv[0]];
  if (!command) {
    ctx.stderr(`Usage: ledger.mjs <${Object.keys(COMMANDS).join("|")}> [--root <dir>]\n`);
    return 2;
  }
  try {
    return command(ctx);
  } catch (err) {
    ctx.stderr(`ledger.mjs ${argv[0]}: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
