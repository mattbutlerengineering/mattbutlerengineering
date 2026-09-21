#!/usr/bin/env node

/**
 * Architecture fitness test: every `/slash-command` named in an instruction
 * file must resolve to a skill that exists, or be declared here with a
 * reason.
 *
 * This is failure mode 1 (a documented capability that reads as available
 * and is not) applied to the skill surface. Three instances found in this
 * repo, none of which any existing check could see:
 *
 *   - `/ship-loop`  — named in the gotchas header as an autonomous loop to
 *                     run `/gotcha-harvest` after. Replaced by
 *                     `/implement-queue` two migrations earlier (#5592).
 *   - `/reflect`    — named as the mechanism for the human-correction half
 *                     of the documented learning loop, in CLAUDE.md, the
 *                     promotion-path table, the gotchas header and three
 *                     READMEs. It has never existed in this repo's history
 *                     or in ~/.claude/skills/ (#5586). The correction
 *                     corpus stopped growing 2026-05-10, which is exactly
 *                     what a documented-but-unimplemented capture step
 *                     looks like from the outside.
 *   - `/audit-workflow` — named in AGENTS.md as "re-run this whenever you
 *                     add or remove tools". It lives in an external
 *                     marketplace that docs/ai-tooling-audit.md itself
 *                     records as "not yet registered", so the slash command
 *                     does not resolve from a session in this project.
 *
 * Why a registry and not a heuristic: a bare `/name` in backticks is
 * ambiguous in this repo's prose — `/health`, `/public` and `/hospitality`
 * are HTTP routes written the same way. Measured across the instruction
 * surface, a naive "backticked /name that is not a skill directory" rule
 * flags 22 names of which only 3 are real. So the check does not guess.
 * It requires that every non-resolving name be listed below with a reason,
 * which turns an invisible fiction into a deliberate, reviewed declaration:
 * the next invented command fails CI until someone writes down what it is.
 *
 * Scope is deliberately narrow — the files an agent reads as instructions.
 * Per-app CLAUDE.md files are excluded because they document route tables
 * (`/timeline`, `/guests`, `/floor-plans`), and .claude/improvement-loop/,
 * .claude/reflections/ and .claude/sessions/*.md are excluded because they
 * are append-only historical records: a past mention of a since-removed
 * skill is a true statement about the past, not a live claim.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Names that appear as `/name` in an instruction file but are not — and are
 * not meant to be — a skill in this repo. Every entry needs a reason a
 * reviewer can check.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DECLARED_NON_REPO_REFERENCES = Object.freeze({
  // --- user-level skill installs (~/.claude/skills/), documented as such in
  // CLAUDE.md § Skills. Not in this repo by design; PR #3323 moved them out.
  caveman: "user-level skill install, not in this repo (CLAUDE.md § Skills)",
  diagnose: "user-level skill install, not in this repo (CLAUDE.md § Skills)",
  "grill-with-docs": "user-level skill install, not in this repo (CLAUDE.md § Skills)",
  improve: "user-level skill install, not in this repo (CLAUDE.md § Skills)",
  "improve-codebase-architecture":
    "user-level skill install, not in this repo (CLAUDE.md § Skills)",
  tdd: "user-level skill install, not in this repo (CLAUDE.md § Skills)",
  "to-issues": "user-level skill install, not in this repo (CLAUDE.md § Skills)",
  triage: "user-level skill install, not in this repo (CLAUDE.md § Skills)",
  "write-a-skill": "user-level skill install, not in this repo (CLAUDE.md § Skills)",

  // --- claude-mem commands, documented as unavailable until `npx claude-mem
  // install` is run. CLAUDE.md already says so at the point of use.
  babysit: "claude-mem command; unavailable until `npx claude-mem install`",
  do: "claude-mem command; unavailable until `npx claude-mem install`",
  "make-plan": "claude-mem command; unavailable until `npx claude-mem install`",
  "mem-search": "claude-mem command; unavailable until `npx claude-mem install`",
  "smart-explore": "claude-mem command; unavailable until `npx claude-mem install`",
  "timeline-report": "claude-mem command; unavailable until `npx claude-mem install`",

  // --- external marketplace, recorded as NOT registered in
  // docs/ai-tooling-audit.md, so the slash command does not resolve here.
  "audit-workflow":
    "ai-tooling marketplace skill; marketplace not registered (docs/ai-tooling-audit.md) — the report it produces was made by following its SKILL.md by hand",

  // --- named only in sentences stating it does not exist (#5586). Kept so a
  // future edit that reinstates it as a live capability has to change this
  // entry too.
  reflect:
    "does not exist and never has (#5586); referenced only in prose saying so — human corrections are written to .claude/memory/corrections/ by hand",
  "ship-loop":
    "removed in #5592, replaced by /implement-queue; referenced only in prose recording that removal",

  // --- HTTP routes and placeholders written in the same `/name` shape.
  health: "HTTP liveness route, not a slash command",
  public: "URL path prefix (the /public ingress), not a slash command",
  hospitality: "app path prefix, not a slash command",
  "skill-name": "placeholder in `/<skill-name>`, not a literal command",
});

/** Directories under .claude/ whose markdown is historical, not instructional. */
const HISTORICAL_DIRS = Object.freeze(["improvement-loop", "reflections", "sessions", "memory"]);

const REFERENCE_PATTERN = /`\/([a-z][a-z0-9-]*)`/g;

/**
 * Every `/name` reference in a markdown body, with the line it sits on.
 *
 * @param {string} markdown
 * @returns {{ name: string, line: number }[]}
 */
export function extractSkillReferences(markdown) {
  const found = [];
  const lines = markdown.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(REFERENCE_PATTERN)) {
      found.push({ name: match[1], line: index + 1 });
    }
  }
  return found;
}

/**
 * Decide what a single reference is. Pure — the caller supplies the world.
 *
 * @param {string} name
 * @param {{ repoSkills: ReadonlySet<string>, pluginSkills: ReadonlySet<string>, declared?: Readonly<Record<string, string>> }} world
 * @returns {{ kind: "repo" | "plugin" | "declared" | "unresolved", reason?: string }}
 */
export function classifySkillReference(name, { repoSkills, pluginSkills, declared }) {
  if (repoSkills.has(name)) return { kind: "repo" };
  if (pluginSkills.has(name)) return { kind: "plugin" };
  const registry = declared ?? DECLARED_NON_REPO_REFERENCES;
  if (Object.hasOwn(registry, name)) return { kind: "declared", reason: registry[name] };
  return { kind: "unresolved" };
}

function listDirs(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path).filter((entry) => statSync(join(path, entry)).isDirectory());
}

/**
 * @param {string} root
 * @returns {{ repoSkills: Set<string>, pluginSkills: Set<string> }}
 */
export function collectSkillDirectories(root = DEFAULT_ROOT) {
  const repoSkills = new Set(listDirs(join(root, ".claude/skills")));
  const pluginSkills = new Set();
  for (const plugin of listDirs(join(root, "plugins"))) {
    for (const skill of listDirs(join(root, "plugins", plugin, "skills"))) {
      pluginSkills.add(skill);
    }
  }
  return { repoSkills, pluginSkills };
}

/**
 * The instruction surface: files an agent reads as directives about how this
 * repo works. Excludes per-app CLAUDE.md (route tables) and historical logs.
 *
 * @param {string} root
 * @returns {string[]} repo-relative paths
 */
export function collectInstructionFiles(root = DEFAULT_ROOT) {
  const files = [];
  for (const top of ["CLAUDE.md", "AGENTS.md"]) {
    if (existsSync(join(root, top))) files.push(top);
  }
  for (const rule of existsSync(join(root, ".claude/rules"))
    ? readdirSync(join(root, ".claude/rules"))
    : []) {
    if (rule.endsWith(".md")) files.push(`.claude/rules/${rule}`);
  }
  for (const skill of listDirs(join(root, ".claude/skills"))) {
    const candidate = `.claude/skills/${skill}/SKILL.md`;
    if (existsSync(join(root, candidate))) files.push(candidate);
  }
  for (const agent of existsSync(join(root, ".claude/agents"))
    ? readdirSync(join(root, ".claude/agents"))
    : []) {
    if (agent.endsWith(".md")) files.push(`.claude/agents/${agent}`);
  }
  for (const dir of listDirs(join(root, ".claude"))) {
    if (HISTORICAL_DIRS.includes(dir) || dir === "rules" || dir === "skills" || dir === "agents") {
      continue;
    }
    const candidate = `.claude/${dir}/README.md`;
    if (existsSync(join(root, candidate))) files.push(candidate);
  }
  return files;
}

/**
 * @param {string} root
 * @returns {{ file: string, line: number, name: string }[]}
 */
export function findUnresolvedReferences(root = DEFAULT_ROOT) {
  const { repoSkills, pluginSkills } = collectSkillDirectories(root);
  const findings = [];
  for (const file of collectInstructionFiles(root)) {
    const body = readFileSync(join(root, file), "utf8");
    for (const { name, line } of extractSkillReferences(body)) {
      if (classifySkillReference(name, { repoSkills, pluginSkills }).kind === "unresolved") {
        findings.push({ file, line, name });
      }
    }
  }
  return findings;
}

export const formatUnresolved = ({ file, line, name }) => `${file}:${line}  /${name}`;

export function buildFailMessage(findings) {
  return [
    `FAIL: ${findings.length} slash-command reference(s) in instruction files resolve to nothing.`,
    "Each one must be resolved in ONE of these ways:",
    "  1. Create the skill at .claude/skills/<name>/SKILL.md (or plugins/<p>/skills/<name>/).",
    "  2. Remove the reference, if the capability is not wanted.",
    "  3. Add it to DECLARED_NON_REPO_REFERENCES in scripts/check-skill-references.mjs",
    "     with a reason — for a user-level install, an unregistered marketplace,",
    "     an HTTP route written in the same shape, or a name kept only in prose",
    "     that says it does not exist.",
    "Unresolved reference(s):",
  ].join("\n");
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-skill-references.mjs");

if (isMain) {
  const findings = findUnresolvedReferences();
  process.exit(
    runCheck({
      name: "Skill references",
      findings,
      formatFinding: formatUnresolved,
      passMessage:
        "PASS: Every /slash-command named in an instruction file resolves to a skill or is declared with a reason.",
      failMessage: buildFailMessage(findings),
    })
  );
}
