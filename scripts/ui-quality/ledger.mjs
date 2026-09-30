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
 *
 * Pure core (`buildLedger`, `diffIdentity`, `parseLedger`, `renderLedger`) plus a
 * `main(argv, deps)` whose deps (`inventory`, `lastChangedAt`, `gitDepth`, fs
 * root) default to the real repo. Exit codes: 0 ok, 1 check failed, 2 bad input.
 *
 * Usage: node scripts/ui-quality/ledger.mjs <generate|check> [--root <dir>]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePath } from "../metrics-store.mjs";
import { createRepoIo, extractAll } from "./routes.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const LEDGER_METRIC = "ui-quality-ledger";

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
// CLI body
// ---------------------------------------------------------------------------

function readCommitted(path) {
  return existsSync(path) ? parseLedger(readFileSync(path, "utf8")) : null;
}

function generate(deps, path) {
  const routes = deps.inventory();
  const committed = readCommitted(path) ?? [];
  const rows = buildLedger(routes, committed, { lastChangedAt: deps.lastChangedAt });
  writeFileSync(path, renderLedger(rows));
  deps.stderr(`ledger.mjs generate: ${rows.length} rows (git_depth: ${deps.gitDepth()})\n`);
  return 0;
}

function check(deps, path) {
  const committed = readCommitted(path);
  if (committed === null) {
    deps.stdout(`FAIL: ${path} is missing — run: node scripts/ui-quality/ledger.mjs generate\n`);
    return 1;
  }
  const routes = deps.inventory();
  const { added, removed, changed } = diffIdentity(routes, committed);
  const lines = [
    ...added.map((r) => `  added:   ${r.app} ${r.route}`),
    ...removed.map((r) => `  removed: ${r.app} ${r.route}`),
    ...changed.map((r) => `  changed: ${r.app} ${r.route}`),
  ];
  const rerendered = renderLedger(buildLedger(routes, committed, { lastChangedAt: () => null }));
  if (lines.length === 0 && rerendered !== readFileSync(path, "utf8")) {
    lines.push("  order/format differs from a regenerated ledger");
  }
  if (lines.length === 0) {
    deps.stdout(`PASS: ui-quality ledger matches the route inventory (${committed.length} rows)\n`);
    return 0;
  }
  deps.stdout(
    `FAIL: ui-quality ledger is stale — run: node scripts/ui-quality/ledger.mjs generate\n${lines.join("\n")}\n`
  );
  return 1;
}

const COMMANDS = { generate, check };

/**
 * @param {string[]} argv
 * @param {object} [deps] root, inventory, lastChangedAt, gitDepth, stdout, stderr
 * @returns {number} exit code
 */
export function main(argv, deps = {}) {
  const rootFlag = argv.indexOf("--root");
  const root = rootFlag !== -1 ? resolve(argv[rootFlag + 1]) : (deps.root ?? DEFAULT_ROOT);
  const gitDepth = deps.gitDepth ?? createGitDepth(root);
  const resolved = {
    inventory: () => extractAll(createRepoIo(root)),
    lastChangedAt: createLastChangedAt(root, gitDepth),
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    ...deps,
    gitDepth,
  };
  const command = COMMANDS[argv[0]];
  if (!command) {
    resolved.stderr(`Usage: ledger.mjs <${Object.keys(COMMANDS).join("|")}> [--root <dir>]\n`);
    return 2;
  }
  try {
    return command(resolved, resolvePath(LEDGER_METRIC, { root }));
  } catch (err) {
    resolved.stderr(`ledger.mjs ${argv[0]}: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
