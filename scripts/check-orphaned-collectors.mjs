#!/usr/bin/env node

/**
 * Fails when a guarded inference/collector module is reachable from nothing
 * that ever runs.
 *
 * This repo has now built the same dead artifact twice: a pure classifier or
 * sensor, fully implemented and fully unit-tested, whose output no live code
 * path ever consumed. `domainActivity` sat that way (#3493/#3664), and so did
 * the `human_touch_reason` classifier chain (#3805-#3847) until #4239 wired a
 * caller in. Both times the module looked healthy — green tests, a real
 * importer — and both times the gap was rediscovered by an ideation cycle
 * rather than by anything red.
 *
 * The load-bearing detail is that a *direct-importer* check would have caught
 * neither. `scripts/classify-human-touch.mjs` always had an importer:
 * `scripts/backfill-human-touch-reasons.mjs`. But that importer was itself a
 * one-time script nothing invoked, so the classifier still produced nothing.
 * "Has an importer" and "runs" are different questions, and only the second
 * one matters. This check answers the second: a guarded module must be
 * reachable, through in-repo imports, from a LIVE ROOT — a script named by a
 * GitHub workflow, a root package.json script, or a skill.
 *
 * Deliberately allowlist-based, not a general dead-code detector. It reports
 * only the modules in GUARDED_MODULES, so it cannot drown a PR in findings
 * about code whose deadness nobody has decided is a defect.
 *
 * Known limitation: reachability is import-level. A live root that imports a
 * guarded module and never calls the binding reads as reachable here. Closing
 * that needs call-graph analysis; the failure this check exists to prevent —
 * a whole module wired to nothing — is the import-level one.
 */

import { readFileSync } from "node:fs";
import { relative, sep, posix } from "node:path";

import { walkFiles, DEFAULT_IGNORE_DIRS } from "./lib/repo-scan.mjs";
import { runCheck } from "./lib/fitness-check.mjs";
import { root } from "./dep-graph-discovery.mjs";

/**
 * Modules this check is responsible for. Each entry needs a reason naming what
 * the module produces — an allowlist entry without one cannot be evaluated by
 * the next reader, who has to decide whether the exemption still applies.
 */
export const GUARDED_MODULES = [
  {
    module: "scripts/classify-human-touch.mjs",
    reason:
      "infers why a merged agent PR needed a human; shipped with zero live callers for the whole #3805-#3847 chain until #4239",
  },
  {
    module: "plugins/acmm/scripts/human-touch-reasons.js",
    reason:
      "tallies human_touch_reason into the ACMM report; the consuming end of the same chain, dead for the same span",
  },
];

/** Directories scanned for in-repo modules. */
export const SCAN_DIRS = ["scripts", "plugins/acmm/scripts"];

/** Files whose text can make a script a live root. */
export const REFERENCE_GLOBS = [
  { dir: ".github/workflows", match: (n) => n.endsWith(".yml") || n.endsWith(".yaml") },
  { dir: ".claude/skills", match: (n) => n === "SKILL.md" },
];

const MODULE_RE = /\.(mjs|cjs|js)$/;
const IGNORE_DIRS = new Set([...DEFAULT_IGNORE_DIRS, "build", ".next", "graphify-out"]);

/**
 * Static and dynamic relative import specifiers in a source file.
 *
 * Bare specifiers are dropped: a package import cannot participate in in-repo
 * reachability, and keeping them would only add unresolvable graph edges.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function parseRelativeImports(source) {
  const found = [];
  const patterns = [
    /\bfrom\s+["'](\.[^"']*)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']*)["']\s*\)/g,
    /\brequire\s*\(\s*["'](\.[^"']*)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) found.push(m[1]);
  }
  return found;
}

/**
 * Resolve a relative specifier against the repo-relative path importing it.
 *
 * @param {string} importerPath - POSIX repo-relative path of the importing file.
 * @param {string} specifier - A relative specifier (starts with `.`).
 * @returns {string} POSIX repo-relative path of the imported file.
 */
export function resolveImport(importerPath, specifier) {
  return posix.normalize(posix.join(posix.dirname(importerPath), specifier));
}

/**
 * True for files the test runner owns. A test importing a module says nothing
 * about whether that module runs in production — treating it as an edge is
 * exactly how a fully-tested dead module reads as alive.
 *
 * @param {string} path - POSIX repo-relative path.
 */
export function isTestPath(path) {
  return path.includes("/__tests__/") || /\.test\.(js|mjs|cjs|ts|tsx)$/.test(path);
}

/**
 * Import graph over in-repo modules, importer -> set of imported paths.
 * Test files are excluded as both source and target of edges.
 *
 * @param {string[]} filePaths - POSIX repo-relative module paths.
 * @param {(path: string) => string} readFile
 * @returns {Map<string, Set<string>>}
 */
export function buildImportGraph(filePaths, readFile) {
  const graph = new Map();
  for (const path of filePaths) {
    if (isTestPath(path)) continue;
    let source;
    try {
      source = readFile(path);
    } catch {
      continue;
    }
    const targets = new Set(
      parseRelativeImports(source)
        .map((spec) => resolveImport(path, spec))
        .filter((target) => !isTestPath(target))
    );
    if (targets.size > 0) graph.set(path, targets);
  }
  return graph;
}

/**
 * Scripts named by something that actually runs them.
 *
 * @param {{ scriptPaths: string[], referenceTexts: string[] }} input
 * @returns {Set<string>}
 */
export function findLiveRoots({ scriptPaths, referenceTexts }) {
  const haystack = referenceTexts.join("\n");
  return new Set(scriptPaths.filter((path) => haystack.includes(path)));
}

/**
 * Guarded modules that no live root can reach.
 *
 * @param {object} input
 * @param {{ module: string, reason: string }[]} input.guarded
 * @param {Map<string, Set<string>>} input.graph
 * @param {Set<string>} input.liveRoots
 * @param {Set<string>} input.existingFiles
 * @returns {{ findings: { kind: "unreachable" | "missing-module", path: string, reason: string }[] }}
 */
export function findUnreachableCollectors({ guarded, graph, liveRoots, existingFiles }) {
  const reachable = new Set();
  const queue = [...liveRoots];
  while (queue.length > 0) {
    const current = queue.pop();
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const next of graph.get(current) ?? []) queue.push(next);
  }

  const findings = [];
  for (const { module, reason } of guarded) {
    if (!existingFiles.has(module)) {
      findings.push({ kind: "missing-module", path: module, reason });
      continue;
    }
    if (!reachable.has(module)) findings.push({ kind: "unreachable", path: module, reason });
  }
  return { findings };
}

export const FAIL_MESSAGE =
  "FAIL: A guarded collector module is reachable from nothing that runs.\n" +
  "The module has tests and may well have an importer — but no workflow,\n" +
  "package.json script, or skill can reach it, so it produces nothing live.\n" +
  "Either wire a live caller in, or remove the module and its entry from\n" +
  "GUARDED_MODULES in scripts/check-orphaned-collectors.mjs.";

/**
 * @param {{ kind: string, path: string, reason: string }} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  return finding.kind === "missing-module"
    ? `${finding.path} — guarded module no longer exists; drop its GUARDED_MODULES entry (was: ${finding.reason})`
    : `${finding.path} — no live root reaches it (${finding.reason})`;
}

/* c8 ignore start -- CLI entrypoint, exercised via repo-audit not unit tests */
/**
 * Collect POSIX repo-relative module paths under the scan dirs.
 *
 * @param {string} [repoRoot]
 * @returns {string[]}
 */
export function collectModulePaths(repoRoot = root) {
  return SCAN_DIRS.flatMap((dir) =>
    walkFiles(posix.join(repoRoot, dir), {
      ignoreDirs: IGNORE_DIRS,
      match: (name) => MODULE_RE.test(name),
    })
  )
    .map((file) => relative(repoRoot, file).split(sep).join("/"))
    .sort();
}

/**
 * Text of everything that can make a script live.
 *
 * @param {string} [repoRoot]
 * @returns {string[]}
 */
export function collectReferenceTexts(repoRoot = root) {
  const texts = [readFileSync(posix.join(repoRoot, "package.json"), "utf-8")];
  for (const { dir, match } of REFERENCE_GLOBS) {
    for (const file of walkFiles(posix.join(repoRoot, dir), { ignoreDirs: IGNORE_DIRS, match })) {
      try {
        texts.push(readFileSync(file, "utf-8"));
      } catch {
        /* unreadable reference file contributes nothing */
      }
    }
  }
  return texts;
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-orphaned-collectors.mjs");

if (isMain) {
  const modulePaths = collectModulePaths();
  const { findings } = findUnreachableCollectors({
    guarded: GUARDED_MODULES,
    graph: buildImportGraph(modulePaths, (p) => readFileSync(posix.join(root, p), "utf-8")),
    liveRoots: findLiveRoots({
      scriptPaths: modulePaths,
      referenceTexts: collectReferenceTexts(),
    }),
    existingFiles: new Set(modulePaths),
  });

  process.exit(
    runCheck({
      name: "orphaned collector modules",
      findings,
      formatFinding,
      passMessage: `PASS: all ${GUARDED_MODULES.length} guarded collector module(s) reachable from a live root`,
      failMessage: FAIL_MESSAGE,
    })
  );
}
/* c8 ignore stop */
