#!/usr/bin/env node

/**
 * Architecture fitness test: every workflow that invokes `node <script>`
 * must install workspace dependencies first if that script's import graph
 * reaches a bare (non-builtin) module specifier.
 *
 * Four scheduled workflows (#4225) ran `node scripts/foo.mjs` after a bare
 * `actions/checkout` + `actions/setup-node` — no `pnpm install`, so
 * `node_modules` never existed and any workspace-package import
 * (`@mbe/gh-client`, `@mbe/agent-core`) or plain npm import (`prettier`,
 * reached one relative hop deep via `plugins/acmm/scripts/state.js`) failed
 * with `ERR_MODULE_NOT_FOUND`. `branch-cleanup.yml` and
 * `secret-rotation-reminder.yml` are the working control: they use
 * `uses: ./.github/actions/setup-workspace`, the shared composite action
 * that owns pnpm setup, Node version, caching, and a frozen-lockfile
 * install.
 *
 * This scans every `node <path>` invocation in `.github/workflows/*.yml`,
 * follows that script's relative imports transitively (the class this
 * guards against was one relative hop deep, so a shallow single-file scan
 * would have missed it), and flags any workflow that reaches a bare
 * specifier without using the shared setup action.
 *
 * Usage: node scripts/check-workflow-deps.mjs
 * Exit code: 0 if every dependency-needing workflow installs first, 1 otherwise
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const NODE_SCRIPT_RE = /\bnode\s+((?:[\w.-]+\/)+[\w.-]+\.(?:mjs|cjs|js|ts))/g;

// A workflow "installs dependencies" either by using the shared composite
// action (the preferred pattern — see acceptance criteria on #4225) or by
// hand-rolling `pnpm install` in a run step (several existing workflows,
// e.g. acmm-regression.yml/pr-metrics.yml/nightly-compliance.yml, do this
// and are NOT broken — only the setup-workspace pattern is required for
// *new* fixes here, not retrofitted onto every workflow that already
// installs correctly).
const SETUP_WORKSPACE_RE = /uses:\s*\.\/\.github\/actions\/setup-workspace/;
const INLINE_INSTALL_RE = /\bpnpm\s+install\b/;

// Deliberately grammar-narrow, not a general JS parser: the clause between
// `import`/`export` and `from` is restricted to characters that can
// actually appear in an import/export clause (identifiers, `$`, whitespace,
// commas, `*`, braces). A JSDoc comment quoting an unrelated phrase like
// `from "never classified at all"` (real text in this repo, see
// merge-queue-eligibility.mjs) always contains punctuation outside that set
// before reaching its own quoted string, so the lazy match can't cross it —
// verified by running this against the pre-fix repo and confirming those
// false positives disappeared. Anchored to line start (`^\s*`) since every
// real import/export declaration in this prettier-formatted codebase starts
// its own line.
const IMPORT_FROM_RE = /^\s*import\s+[\w$\s,*{}]+?\bfrom\s+["']([^"']+)["']/gm;
const BARE_IMPORT_RE = /^\s*import\s+["']([^"']+)["']/gm;
const EXPORT_FROM_RE = /^\s*export\s+[\w$\s,*{}]+?\bfrom\s+["']([^"']+)["']/gm;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

const BUILTIN_SPECIFIERS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

/** True for Node builtins ("node:fs" or bare "fs"), false for anything resolved from node_modules. */
function isBuiltinSpecifier(specifier) {
  return BUILTIN_SPECIFIERS.has(specifier);
}

/** Extracts every import/export/require specifier string referenced in `source`. */
export function extractImportSpecifiers(source) {
  const patterns = [IMPORT_FROM_RE, BARE_IMPORT_RE, EXPORT_FROM_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

/** Resolves a relative specifier to an on-disk file, trying common extensions. */
function resolveRelativeSpecifier(fromDir, specifier) {
  const base = resolve(fromDir, specifier);
  const candidates = /\.\w+$/.test(specifier)
    ? [base]
    : [
        `${base}.mjs`,
        `${base}.js`,
        `${base}.cjs`,
        `${base}.ts`,
        join(base, "index.mjs"),
        join(base, "index.js"),
      ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * Walks `entryPath`'s import graph, following only relative imports, and
 * returns every bare (non-builtin) specifier reachable from it — the set of
 * modules that need `node_modules` to resolve.
 *
 * @param {string} entryPath - absolute path to a script file
 * @param {Set<string>} visited - internal recursion guard
 * @returns {Set<string>}
 */
export function collectReachableBareSpecifiers(entryPath, visited = new Set()) {
  const bareSpecifiers = new Set();
  if (visited.has(entryPath) || !existsSync(entryPath)) {
    return bareSpecifiers;
  }
  visited.add(entryPath);

  const source = readFileSync(entryPath, "utf8");
  for (const specifier of extractImportSpecifiers(source)) {
    if (isBuiltinSpecifier(specifier)) continue;

    if (specifier.startsWith(".")) {
      const resolved = resolveRelativeSpecifier(dirname(entryPath), specifier);
      if (resolved) {
        for (const bare of collectReachableBareSpecifiers(resolved, visited)) {
          bareSpecifiers.add(bare);
        }
      }
      continue;
    }

    bareSpecifiers.add(specifier);
  }

  return bareSpecifiers;
}

/**
 * Checks one workflow file: finds every `node <script>` invocation, resolves
 * each script's transitive bare-specifier set, and flags the workflow if it
 * needs dependencies but never installs them.
 *
 * @param {string} name - workflow file name, for reporting
 * @param {string} content - raw workflow YAML
 * @param {string} root - repo root, for resolving script paths
 */
export function checkWorkflowDeps(name, content, root = DEFAULT_ROOT) {
  const scriptPaths = [...new Set([...content.matchAll(NODE_SCRIPT_RE)].map((m) => m[1]))];
  const installsDeps = SETUP_WORKSPACE_RE.test(content) || INLINE_INSTALL_RE.test(content);

  const bareSpecifiers = new Set();
  for (const scriptPath of scriptPaths) {
    const absPath = resolve(root, scriptPath);
    if (!existsSync(absPath)) continue;
    for (const specifier of collectReachableBareSpecifiers(absPath)) {
      bareSpecifiers.add(specifier);
    }
  }

  const errors = [];
  if (bareSpecifiers.size > 0 && !installsDeps) {
    errors.push(
      `invokes node script(s) [${scriptPaths.join(", ")}] whose import graph reaches bare ` +
        `specifier(s) [${[...bareSpecifiers].sort().join(", ")}] but never installs dependencies ` +
        "(no `uses: ./.github/actions/setup-workspace` and no `pnpm install` run step)"
    );
  }

  return { name, scriptPaths, bareSpecifiers: [...bareSpecifiers], installsDeps, errors };
}

/** Scans every workflow in `<root>/.github/workflows`. */
export function findWorkflowDepsFindings(root = DEFAULT_ROOT) {
  const workflowsDir = join(root, ".github", "workflows");

  if (!existsSync(workflowsDir)) {
    return { results: [], findings: [] };
  }

  const results = readdirSync(workflowsDir)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort()
    .map((file) => checkWorkflowDeps(file, readFileSync(join(workflowsDir, file), "utf-8"), root));

  const findings = results.flatMap((result) =>
    result.errors.map((error) => ({ workflow: result.name, error }))
  );

  return { results, findings };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-workflow-deps.mjs");

if (isMain) {
  const { findings } = findWorkflowDepsFindings();

  const exitCode = runCheck({
    name: "Workflow dependency installs",
    findings,
    formatFinding: (finding) => `${finding.workflow}: ${finding.error}`,
    passMessage: "PASS: Every dependency-needing workflow installs before running its script.",
    failMessage:
      "FAIL: Some workflows run a node script without installing dependencies first.\n" +
      "A bare `actions/setup-node` step does not create node_modules — any workspace-\n" +
      "package or npm import in the script (or anything it imports transitively) fails\n" +
      "with ERR_MODULE_NOT_FOUND. Replace the setup-node step with\n" +
      "`uses: ./.github/actions/setup-workspace` — see .github/workflows/branch-cleanup.yml.",
  });
  process.exit(exitCode);
}
