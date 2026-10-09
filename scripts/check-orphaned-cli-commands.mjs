#!/usr/bin/env node

/**
 * Fails when a `mbe` CLI command is declared but attached to nothing, so no
 * invocation of the CLI can ever reach it.
 *
 * `commander` only exposes a command that something calls `.addCommand()` on.
 * A `new Command("foo")` export that is never attached is therefore not a
 * command at all — `mbe foo` exits "unknown command" — even though the module
 * reads as a finished feature and its unit tests pass. That combination is the
 * trap: the tests exercise the exported object directly
 * (`compoundCommand.parseAsync([...])`), so they stay green forever while
 * proving nothing about reachability. A passing suite on unreachable code is
 * worse than an absent one, because it reads as coverage.
 *
 * This is the same class the repo has already guarded twice on other
 * surfaces — `check-orphaned-tests.mjs` (a test file outside any workspace
 * package CI runs) and `check-orphaned-collectors.mjs` (a sensor reachable
 * from no live root) — plus the Playwright specs no workflow invoked (#3955).
 * The CLI-command surface was the one left uncovered, and it was uncovered
 * *knowingly*: `check-claude-md-table-drift.mjs` carries an explicit test
 * ("a Command declared but never registered in index.ts is not flagged")
 * because the CLAUDE.md table documents only *registered* commands, so an
 * unattached one is correctly invisible to it. That blind spot is deliberate
 * there and closed here.
 *
 * Why an exact check and not a heuristic: reachability for a commander command
 * is a syntactic fact, not an inference. A declaration is reachable iff its
 * exported symbol appears inside some `.addCommand(...)` in the CLI source.
 * There is no call-graph analysis and no judgment call, so this cannot report
 * a false positive the way an import-level dead-code detector can.
 *
 * Hermetic: reads only the repo tree. No network, no build artifacts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { walkFiles } from "./lib/repo-scan.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

/** Directory holding command modules, relative to the repo root. */
export const COMMANDS_DIR = "tools/cli/src/commands";

/** Directory scanned for `.addCommand()` attachment sites. */
export const CLI_SRC_DIR = "tools/cli/src";

/**
 * Declarations whose unreachability is accepted. Each entry needs a reason
 * naming why the command is allowed to exist unattached — an exemption without
 * one cannot be evaluated by the next reader, who has to decide whether it
 * still applies. A stale entry is reported, so an exemption cannot outlive
 * the thing it exempts.
 *
 * @type {{ symbol: string; reason: string }[]}
 */
export const ALLOWLIST = [];

/** Matches `export const fooCommand = new Command("foo")`. */
const DECLARATION_RE = /export\s+const\s+(\w+)\s*=\s*new\s+Command\(\s*"([^"]+)"/g;

/** Matches `.addCommand(fooCommand)` on any receiver (`program`, a parent command). */
const ATTACHMENT_RE = /\.addCommand\(\s*(\w+)\s*\)/g;

/**
 * Extract every named command declaration from one module's source.
 *
 * @param {string} source
 * @param {string} file - repo-relative path, carried into the finding
 * @returns {{ symbol: string; name: string; file: string }[]}
 */
export function parseCommandDeclarations(source, file) {
  return [...source.matchAll(DECLARATION_RE)].map(([, symbol, name]) => ({ symbol, name, file }));
}

/**
 * Extract every symbol that something attaches as a subcommand.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function parseAttachedSymbols(source) {
  return [...source.matchAll(ATTACHMENT_RE)].map(([, symbol]) => symbol);
}

/**
 * Partition declarations into orphans and allowlisted-but-absent entries.
 *
 * @param {object} input
 * @param {{ symbol: string; name: string; file: string }[]} input.declarations
 * @param {Iterable<string>} input.attachedSymbols
 * @param {{ symbol: string; reason: string }[]} [input.allowlist]
 * @returns {{ orphans: { symbol: string; name: string; file: string }[]; staleAllowlist: string[] }}
 */
export function findOrphanedCliCommands({ declarations, attachedSymbols, allowlist = ALLOWLIST }) {
  const attached = new Set(attachedSymbols);
  const orphans = [];
  const usedSymbols = new Set();

  for (const declaration of declarations) {
    if (attached.has(declaration.symbol)) continue;

    const allowed = allowlist.find((entry) => entry.symbol === declaration.symbol);
    if (allowed) {
      usedSymbols.add(allowed.symbol);
      continue;
    }
    orphans.push(declaration);
  }

  const staleAllowlist = allowlist
    .map((entry) => entry.symbol)
    .filter((symbol) => !usedSymbols.has(symbol));

  return { orphans, staleAllowlist };
}

/**
 * Flatten a scan result into findings for the shared fitness-check reporter.
 *
 * @param {{ orphans: { symbol: string; name: string; file: string }[]; staleAllowlist: string[] }} result
 * @returns {({ kind: "orphan"; symbol: string; name: string; file: string } | { kind: "stale-allowlist"; symbol: string })[]}
 */
export function toFindings({ orphans, staleAllowlist }) {
  return [
    ...[...orphans]
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((orphan) => ({ kind: /** @type {const} */ ("orphan"), ...orphan })),
    ...staleAllowlist.map((symbol) => ({
      kind: /** @type {const} */ ("stale-allowlist"),
      symbol,
    })),
  ];
}

export const FAIL_MESSAGE =
  "FAIL: Some mbe CLI commands are attached to nothing and cannot be invoked.\n" +
  "`commander` only exposes a command something calls `.addCommand()` on, so an\n" +
  "unattached `new Command(...)` export is unreachable — `mbe <name>` exits\n" +
  '"unknown command" — while its unit tests keep passing against the exported\n' +
  "object. Either attach it (in tools/cli/src/index.ts for a top-level command,\n" +
  "or to its parent command) and add it to the CLAUDE.md CLI table, or delete it.\n" +
  "If it must stay unattached, add it to ALLOWLIST in\n" +
  "scripts/check-orphaned-cli-commands.mjs with a reason.\n" +
  "A stale ALLOWLIST entry is reported too — an exemption must not outlive its reason.";

/**
 * @param {{ kind: string; symbol: string; name?: string; file?: string }} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  return finding.kind === "orphan"
    ? `${finding.file}: \`${finding.symbol}\` declares command "${finding.name}" but nothing attaches it`
    : `ALLOWLIST entry "${finding.symbol}" matches no unattached command — remove it`;
}

/**
 * Read declarations and attachment sites off the repo tree.
 *
 * @param {string} repoRoot - absolute path to the repo root
 * @returns {{ declarations: { symbol: string; name: string; file: string }[]; attachedSymbols: string[] }}
 */
export function scanRepo(repoRoot) {
  const isSource = (name) => name.endsWith(".ts") && !name.endsWith(".d.ts");
  const relative = (file) => path.relative(repoRoot, file).split(path.sep).join("/");
  const notATest = (file) => !relative(file).includes("__tests__/");

  const declarations = walkFiles(path.join(repoRoot, COMMANDS_DIR), { match: isSource })
    .filter(notATest)
    .flatMap((file) => parseCommandDeclarations(readFileSync(file, "utf-8"), relative(file)));

  const attachedSymbols = walkFiles(path.join(repoRoot, CLI_SRC_DIR), { match: isSource })
    .filter(notATest)
    .flatMap((file) => parseAttachedSymbols(readFileSync(file, "utf-8")));

  return { declarations, attachedSymbols };
}

/* c8 ignore start -- CLI entrypoint, exercised via repo-audit not unit tests */
const isMain = process.argv[1] && process.argv[1].endsWith("check-orphaned-cli-commands.mjs");

if (isMain) {
  const repoRoot = process.cwd();
  const findings = toFindings(findOrphanedCliCommands(scanRepo(repoRoot)));

  process.exit(
    runCheck({
      name: "orphaned mbe CLI commands",
      findings,
      formatFinding,
      passMessage: "PASS: Every declared mbe CLI command is attached and reachable.",
      failMessage: FAIL_MESSAGE,
    })
  );
}
/* c8 ignore stop */
