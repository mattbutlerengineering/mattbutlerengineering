#!/usr/bin/env node

/**
 * Fails when a hand-maintained table in CLAUDE.md drifts from the repo tree
 * it claims to document — the `## mbe CLI Commands`, `### Skills` /
 * `### Scaffolding Skills`, and `### Subagents` tables.
 *
 * `scripts/check-doc-freshness.mjs` and `scripts/detect-instruction-rot.mjs`
 * already guard *path references* in CLAUDE.md against going dangling. They
 * do nothing for *tables*, which is exactly where drift accumulated: the
 * GitHub-labels table (sourced from the GitHub API — deliberately out of
 * scope here, see below) and the `mbe` CLI-commands table (sourced from
 * `tools/cli/src/index.ts`) both rotted silently while directory-sourced
 * tables (skills, subagents) stayed accurate. See #4881.
 *
 * Deliberately out of scope: the GitHub-labels table. It needs a live GitHub
 * API call, which would make this check non-hermetic. Every other check in
 * this family reads only the repo tree.
 *
 * Hermetic: reads only the repo tree. No network, no GitHub API.
 */

import fs from "node:fs";
import path from "node:path";
import { walkFiles } from "./lib/repo-scan.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

const CLI_COMMANDS_DIR = "tools/cli/src/commands";
const CLI_INDEX_FILE = "tools/cli/src/index.ts";
const CLI_HEADING = "## mbe CLI Commands";
const SKILLS_HEADINGS = ["### Skills", "### Scaffolding Skills"];
const SUBAGENTS_HEADING = "### Subagents";

// ── Markdown table parsing ──────────────────────────────────────────────

/**
 * Locate the markdown table immediately following a heading line and return
 * its raw lines (header row, separator row, and data rows).
 *
 * "Immediately following" tolerates intervening prose lines (e.g. an intro
 * sentence) but stops at the next heading if no table is found first.
 *
 * @param {string} content
 * @param {string} heading - exact heading line text, e.g. "## mbe CLI Commands"
 * @returns {string[]}
 */
export function findTableLinesAfterHeading(content, heading) {
  const lines = content.split("\n");
  const headingIdx = lines.findIndex((l) => l.trim() === heading);
  if (headingIdx === -1) return [];

  let i = headingIdx + 1;
  while (i < lines.length && !lines[i].trim().startsWith("|")) {
    if (lines[i].trim().startsWith("#")) return [];
    i++;
  }

  const tableLines = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    tableLines.push(lines[i]);
    i++;
  }
  return tableLines;
}

/**
 * Parse raw markdown table lines into a header row and data rows (the
 * separator row is dropped).
 *
 * @param {string[]} tableLines
 * @returns {{ headers: string[]; rows: string[][] }}
 */
export function parseTableRows(tableLines) {
  if (tableLines.length < 2) return { headers: [], rows: [] };

  const splitRow = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const headers = splitRow(tableLines[0]);
  const rows = tableLines.slice(2).map(splitRow);
  return { headers, rows };
}

/** Extract the text of every `backtick`-wrapped token in a cell. */
export function extractBacktickTokens(cell) {
  return [...(cell ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

function columnIndex(headers, name) {
  return headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
}

// ── mbe CLI commands: reachable-command extraction ──────────────────────

const COMMAND_DECL_RE = /export const (\w+)\s*=\s*new Command\(\s*"([^"]+)"/g;

/** Collect every `*.ts` file under `tools/cli/src/commands`, excluding tests. */
export function collectCliCommandFiles(root) {
  const dir = path.join(root, CLI_COMMANDS_DIR);
  if (!fs.existsSync(dir)) return [];
  return walkFiles(dir, {
    ignoreDirs: new Set(["__tests__"]),
    match: (name) => name.endsWith(".ts"),
  });
}

/**
 * Map every `export const <ident> = new Command("<name>")` declaration
 * across the given files to its command name and the file content it lives
 * in (so subcommand wiring, which lives alongside the declaration by
 * convention in this repo, can be searched next).
 *
 * @param {string[]} files - absolute file paths
 * @returns {Map<string, { name: string; content: string }>}
 */
export function buildCommandIdentMap(files) {
  const map = new Map();
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    for (const match of content.matchAll(COMMAND_DECL_RE)) {
      const [, ident, name] = match;
      map.set(ident, { name, content });
    }
  }
  return map;
}

/** Identifiers registered as top-level commands via `program.addCommand(x)`. */
export function findProgramTopLevelIdents(indexContent) {
  return [...indexContent.matchAll(/program\.addCommand\(\s*(\w+)\s*\)/g)].map((m) => m[1]);
}

/** Child command identifiers wired via `<ownerIdent>.addCommand(<childIdent>)`. */
function findAddCommandChildren(content, ownerIdent) {
  const re = new RegExp(`\\b${ownerIdent}\\.addCommand\\(\\s*(\\w+)\\s*\\)`, "g");
  return [...content.matchAll(re)].map((m) => m[1]);
}

/**
 * Child command names wired via the commander `.command("name <args>")`
 * builder chained on `<ownerIdent>` (e.g. `generateCommand\n .command("component <name>")`).
 * Names are captured up to the first whitespace so positional-arg
 * placeholders (`<name>`) are dropped.
 */
function findInlineCommandChildren(content, ownerIdent) {
  const re = new RegExp(`${ownerIdent}[\\s\\S]{0,30}?\\.command\\(\\s*"([^"\\s]+)`, "g");
  return [...content.matchAll(re)].map((m) => m[1]);
}

/**
 * Build the set of command/subcommand names actually reachable from `mbe`,
 * starting at `program.addCommand(...)` in index.ts and following each
 * command's own subcommand wiring. A `new Command(...)` that's declared but
 * never registered anywhere in this chain (dead code, e.g. `compound`) is
 * correctly excluded.
 *
 * @param {string} root - repo root
 * @returns {Set<string>}
 */
export function buildReachableCliCommandNames(root) {
  const files = collectCliCommandFiles(root);
  const identMap = buildCommandIdentMap(files);

  const indexPath = path.join(root, CLI_INDEX_FILE);
  if (!fs.existsSync(indexPath)) return new Set();
  const indexContent = fs.readFileSync(indexPath, "utf-8");

  const reachable = new Set();
  const visited = new Set();

  function visit(ident) {
    if (visited.has(ident)) return;
    visited.add(ident);
    const entry = identMap.get(ident);
    if (!entry) return;

    reachable.add(entry.name);
    for (const childIdent of findAddCommandChildren(entry.content, ident)) {
      visit(childIdent);
    }
    for (const childName of findInlineCommandChildren(entry.content, ident)) {
      reachable.add(childName);
    }
  }

  for (const ident of findProgramTopLevelIdents(indexContent)) visit(ident);

  return reachable;
}

/** Flat set of every `Command`/`Subcommands` backtick token in the CLI table. */
export function parseCliCommandsTable(claudeMdContent) {
  const { headers, rows } = parseTableRows(
    findTableLinesAfterHeading(claudeMdContent, CLI_HEADING)
  );
  const commandIdx = columnIndex(headers, "Command");
  const subIdx = columnIndex(headers, "Subcommands");

  const documented = new Set();
  for (const row of rows) {
    for (const tok of extractBacktickTokens(row[commandIdx])) documented.add(tok);
    for (const tok of extractBacktickTokens(row[subIdx])) documented.add(tok);
  }
  return documented;
}

export function findCliCommandDrift(root, claudeMdContent) {
  const documented = parseCliCommandsTable(claudeMdContent);
  const actual = buildReachableCliCommandNames(root);
  return diffSets({ table: "mbe CLI Commands", documented, actual });
}

// ── Skills ────────────────────────────────────────────────────────────

/** Directory names under `dir`, or `[]` if `dir` doesn't exist. */
function listSubdirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

export function readActualSkillNames(root) {
  return new Set(listSubdirs(path.join(root, ".claude", "skills")));
}

/** Skill names shipped as `plugins/*&#47;skills/<name>/`. */
export function readPluginSkillNames(root) {
  const pluginsDir = path.join(root, "plugins");
  if (!fs.existsSync(pluginsDir)) return new Set();

  const result = new Set();
  for (const plugin of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!plugin.isDirectory()) continue;
    for (const skill of listSubdirs(path.join(pluginsDir, plugin.name, "skills"))) {
      result.add(skill);
    }
  }
  return result;
}

/**
 * Skill table rows (Project Automation + Scaffolding), keyed by skill name
 * (leading `/` stripped) to its Purpose cell text — the purpose text is
 * needed to detect the plugin-extraction carve-out.
 *
 * @param {string} claudeMdContent
 * @returns {Map<string, string>}
 */
export function parseSkillsTable(claudeMdContent) {
  const documented = new Map();
  for (const heading of SKILLS_HEADINGS) {
    const { headers, rows } = parseTableRows(findTableLinesAfterHeading(claudeMdContent, heading));
    const skillIdx = columnIndex(headers, "Skill");
    const purposeIdx = columnIndex(headers, "Purpose");
    for (const row of rows) {
      for (const tok of extractBacktickTokens(row[skillIdx])) {
        documented.set(tok.replace(/^\//, ""), row[purposeIdx] ?? "");
      }
    }
  }
  return documented;
}

/**
 * A skill documented in CLAUDE.md but absent from `.claude/skills/` is not a
 * finding when it resolves under `plugins/*&#47;skills/<name>/` AND the row's
 * purpose text names the plugin — e.g. the `/acmm-audit` row, which says
 * "now ships as the `plugins/acmm` plugin".
 */
export function findSkillDrift(root, claudeMdContent) {
  const documented = parseSkillsTable(claudeMdContent);
  const actual = readActualSkillNames(root);
  const pluginSkills = readPluginSkillNames(root);

  const findings = [];
  for (const [name, purpose] of documented) {
    if (actual.has(name)) continue;
    if (pluginSkills.has(name) && /plugin/i.test(purpose)) continue;
    findings.push({ table: "Skills", kind: "documented-but-absent", name });
  }
  for (const name of actual) {
    if (!documented.has(name))
      findings.push({ table: "Skills", kind: "present-but-undocumented", name });
  }
  return findings;
}

// ── Subagents ────────────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const NAME_FIELD_RE = /^name:\s*(.+)$/m;

/** Frontmatter `name:` field of every `.claude/agents/*.md` file — not the filename. */
export function readSubagentNames(root) {
  const dir = path.join(root, ".claude", "agents");
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = fs.readFileSync(path.join(dir, f), "utf-8");
      const frontmatter = content.match(FRONTMATTER_RE);
      const name = frontmatter?.[1].match(NAME_FIELD_RE)?.[1].trim();
      return name ?? null;
    })
    .filter((name) => name !== null);
}

export function findSubagentDrift(root, claudeMdContent) {
  const { headers, rows } = parseTableRows(
    findTableLinesAfterHeading(claudeMdContent, SUBAGENTS_HEADING)
  );
  const subagentIdx = columnIndex(headers, "Subagent");

  const documented = new Set();
  for (const row of rows) {
    for (const tok of extractBacktickTokens(row[subagentIdx])) documented.add(tok);
  }
  const actual = new Set(readSubagentNames(root));

  return diffSets({ table: "Subagents", documented, actual });
}

// ── Shared diff + entry point ───────────────────────────────────────────

/**
 * @param {{ table: string; documented: Set<string>; actual: Set<string> }} input
 * @returns {{ table: string; kind: "documented-but-absent" | "present-but-undocumented"; name: string }[]}
 */
function diffSets({ table, documented, actual }) {
  const findings = [];
  for (const name of documented) {
    if (!actual.has(name)) findings.push({ table, kind: "documented-but-absent", name });
  }
  for (const name of actual) {
    if (!documented.has(name)) findings.push({ table, kind: "present-but-undocumented", name });
  }
  return findings;
}

/**
 * Run all table-drift checks against a repo root.
 *
 * @param {string} root
 * @returns {{ table: string; kind: string; name: string }[]}
 */
export function findTableDrift(root) {
  const claudeMdPath = path.join(root, "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) return [];
  const claudeMdContent = fs.readFileSync(claudeMdPath, "utf-8");

  return [
    ...findCliCommandDrift(root, claudeMdContent),
    ...findSkillDrift(root, claudeMdContent),
    ...findSubagentDrift(root, claudeMdContent),
  ];
}

export function formatFinding(finding) {
  const verb =
    finding.kind === "documented-but-absent"
      ? "documented but not found"
      : "found but not documented";
  return `[${finding.table}] \`${finding.name}\` — ${verb}`;
}

/* c8 ignore start -- CLI entrypoint, exercised via repo-audit not unit tests */
const isMain = process.argv[1] && process.argv[1].endsWith("check-claude-md-table-drift.mjs");

if (isMain) {
  const root = process.argv[2] || process.cwd();
  const findings = findTableDrift(root);

  process.exit(
    runCheck({
      name: "CLAUDE.md table drift",
      findings,
      formatFinding,
      passMessage: "PASS: CLAUDE.md tables (CLI commands, skills, subagents) match the repo tree.",
      failMessage: `FAIL: CLAUDE.md table drift — ${findings.length} issue(s) found:`,
    })
  );
}
/* c8 ignore stop */
