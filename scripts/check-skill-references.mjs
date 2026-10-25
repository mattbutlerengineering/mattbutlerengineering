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
  // docs/claude-reference.md § Skills. Not in this repo by design; PR #3323 moved them out.
  caveman: "user-level skill install, not in this repo (docs/claude-reference.md § Skills)",
  diagnose: "user-level skill install, not in this repo (docs/claude-reference.md § Skills)",
  "grill-with-docs":
    "user-level skill install, not in this repo (docs/claude-reference.md § Skills)",
  improve: "user-level skill install, not in this repo (docs/claude-reference.md § Skills)",
  "improve-codebase-architecture":
    "user-level skill install, not in this repo (docs/claude-reference.md § Skills)",
  tdd: "user-level skill install, not in this repo (docs/claude-reference.md § Skills)",
  "to-issues": "user-level skill install, not in this repo (docs/claude-reference.md § Skills)",
  triage: "user-level skill install, not in this repo (docs/claude-reference.md § Skills)",
  "write-a-skill": "user-level skill install, not in this repo (docs/claude-reference.md § Skills)",

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
    "removed in #5592, replaced by /implement-queue (now /idea-to-prod:implement-queue); referenced only in prose recording that removal",
  "gotcha-harvest":
    "retired in #6332 for /idea-to-prod:knowledge-base's transcript harvest; referenced only in prose recording that retirement",
  "implement-queue":
    "moved in #6332 to the plugin as /idea-to-prod:implement-queue (skills#720); referenced only in prose recording that move",
  "prisma-migrations":
    "retired for the plugin's /idea-to-prod:prisma-migrations (skills#691, skills#934); referenced only in prose recording that retirement",

  // --- HTTP routes and placeholders written in the same `/name` shape.
  health: "HTTP liveness route, not a slash command",
  public: "URL path prefix (the /public ingress), not a slash command",
  hospitality: "app path prefix, not a slash command",
  "skill-name": "placeholder in `/<skill-name>`, not a literal command",
});

/**
 * Skills provided by an enabled plugin and invoked as `/plugin:skill`. Pure
 * data — no network. Must be kept in step with the plugin by hand.
 *
 * idea-to-prod@skills: read from github.com/mattbutlerengineering/skills at
 * commit 90126239059c50a0d4f44fa6634f3d6c3f6ee1d0, plugin 0.9.2 (`skills/*`
 * directories).
 * Plus implement-queue, added by skills#720 (plugin 0.9.5, ADR-0087).
 * Enabled for project sessions in .claude/settings.json (#6332).
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const PLUGIN_PROVIDED_SKILLS = Object.freeze({
  "idea-to-prod": Object.freeze([
    "address-pr-review",
    "animated-diagram",
    "architect",
    "architecture-diagram",
    "audit",
    "automate",
    "autorun",
    "capture",
    "conduct",
    "decompose",
    "deepen",
    "doctor",
    "factory-init",
    "implement-queue",
    "idea",
    "implement",
    "interactive-architecture-diagram",
    "knowledge-base",
    "launch-demo",
    "lean",
    "mermaid",
    "next",
    "operate",
    "pipeline-board",
    "polish",
    "prd",
    "prisma-migrations",
    "review",
    "ship",
    "ux-design",
    "ux-patterns",
    "ux-writing",
    "verify",
    "work-queue",
  ]),
});

/**
 * Repo-local skills deliberately sharing a bare name with a plugin skill. A
 * shared name puts two skills behind one trigger in a local session, which is
 * why #6835 retired the repo-local `prisma-migrations`. Every entry needs a
 * reason a reviewer can check.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DECLARED_PLUGIN_NAME_COLLISIONS = Object.freeze({
  decompose:
    "different skill on purpose: files GitHub issues for /idea-to-prod:implement-queue, where the plugin's writes breakdown.md",
});

/**
 * Repo-local skills whose name matches a plugin-provided skill and is not
 * declared in `allowed`.
 *
 * @param {string} root
 * @param {Readonly<Record<string, string>>} allowed
 * @returns {{ name: string, plugin: string }[]}
 */
export function findPluginNameCollisions(
  root = DEFAULT_ROOT,
  allowed = DECLARED_PLUGIN_NAME_COLLISIONS
) {
  const { repoSkills } = collectSkillDirectories(root);
  return Object.entries(PLUGIN_PROVIDED_SKILLS).flatMap(([plugin, skills]) =>
    skills
      .filter((name) => repoSkills.has(name) && !Object.hasOwn(allowed, name))
      .map((name) => ({ name, plugin }))
  );
}

/** Directories under .claude/ whose markdown is historical, not instructional. */
const HISTORICAL_DIRS = Object.freeze(["improvement-loop", "reflections", "sessions", "memory"]);

const REFERENCE_PATTERN = /`\/([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)`/g;

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
 * @returns {{ kind: "repo" | "plugin" | "plugin-provided" | "declared" | "unresolved", reason?: string }}
 */
export function classifySkillReference(name, { repoSkills, pluginSkills, declared }) {
  const qualifier = name.indexOf(":");
  if (qualifier !== -1) {
    const provided = Object.hasOwn(PLUGIN_PROVIDED_SKILLS, name.slice(0, qualifier))
      ? PLUGIN_PROVIDED_SKILLS[name.slice(0, qualifier)]
      : [];
    return provided.includes(name.slice(qualifier + 1))
      ? { kind: "plugin-provided" }
      : { kind: "unresolved" };
  }
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
  for (const top of ["CLAUDE.md", "docs/claude-reference.md", "AGENTS.md"]) {
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
  const referencesExit = runCheck({
    name: "Skill references",
    findings,
    formatFinding: formatUnresolved,
    passMessage:
      "PASS: Every /slash-command named in an instruction file resolves to a skill or is declared with a reason.",
    failMessage: buildFailMessage(findings),
  });
  const collisionsExit = runCheck({
    name: "Plugin skill name collisions",
    findings: findPluginNameCollisions(),
    formatFinding: ({ name, plugin }) => `.claude/skills/${name}  shadows /${plugin}:${name}`,
    passMessage:
      "PASS: No repo-local skill shares a plugin skill's name without a declared reason.",
    failMessage:
      "FAIL: repo-local skill(s) share a plugin skill's name. Retire the repo-local copy, rename it, or add it to DECLARED_PLUGIN_NAME_COLLISIONS in scripts/check-skill-references.mjs with a reason:",
  });
  process.exit(Math.max(referencesExit, collisionsExit));
}
