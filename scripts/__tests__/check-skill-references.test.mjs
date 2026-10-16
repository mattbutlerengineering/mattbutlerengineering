/**
 * Regression test for #5586: an instruction file naming a `/slash-command`
 * that resolves to nothing reads as an available capability. Three such
 * names were live in this repo (`/ship-loop`, `/reflect`, `/audit-workflow`)
 * and no existing check could see any of them — audit-markdown.mjs validates
 * links and tree diagrams, not command references.
 *
 * See scripts/check-skill-references.mjs for the full rationale.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DECLARED_NON_REPO_REFERENCES,
  DECLARED_PLUGIN_NAME_COLLISIONS,
  classifySkillReference,
  findPluginNameCollisions,
  extractSkillReferences,
  collectInstructionFiles,
  findUnresolvedReferences,
} from "../check-skill-references.mjs";

const tmpDirs = [];

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "skill-refs-"));
  tmpDirs.push(root);
  mkdirSync(join(root, ".claude/skills"), { recursive: true });
  return root;
}

function addSkill(root, name) {
  mkdirSync(join(root, ".claude/skills", name), { recursive: true });
  writeFileSync(join(root, ".claude/skills", name, "SKILL.md"), "# skill\n");
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe("classifySkillReference", () => {
  const world = {
    repoSkills: new Set(["implement-queue"]),
    pluginSkills: new Set(["acmm-audit"]),
    declared: { caveman: "user-level install" },
  };

  it("resolves a skill that exists in .claude/skills", () => {
    expect(classifySkillReference("implement-queue", world)).toEqual({ kind: "repo" });
  });

  it("resolves a skill that exists in a plugin", () => {
    expect(classifySkillReference("acmm-audit", world)).toEqual({ kind: "plugin" });
  });

  it("accepts a declared reference and carries its reason", () => {
    expect(classifySkillReference("caveman", world)).toEqual({
      kind: "declared",
      reason: "user-level install",
    });
  });

  it("rejects a name that is neither a skill nor declared", () => {
    expect(classifySkillReference("reflect", world)).toEqual({ kind: "unresolved" });
  });

  it("does not treat inherited Object properties as declarations", () => {
    // `"constructor" in {}` is true; a naive membership test would accept it.
    expect(classifySkillReference("constructor", world)).toEqual({ kind: "unresolved" });
  });
});

describe("plugin-qualified references (#6332)", () => {
  const world = { repoSkills: new Set(), pluginSkills: new Set() };

  it("extracts a /plugin:skill reference as one name", () => {
    expect(extractSkillReferences("run `/idea-to-prod:automate` now")).toEqual([
      { name: "idea-to-prod:automate", line: 1 },
    ]);
  });

  it("resolves a /idea-to-prod:<known-skill> reference", () => {
    expect(classifySkillReference("idea-to-prod:automate", world)).toEqual({
      kind: "plugin-provided",
    });
  });

  it("reports a /idea-to-prod:<bogus> reference as unresolved", () => {
    expect(classifySkillReference("idea-to-prod:bogus", world)).toEqual({ kind: "unresolved" });
  });

  it("reports an unknown plugin namespace as unresolved", () => {
    expect(classifySkillReference("nope:automate", world)).toEqual({ kind: "unresolved" });
  });

  it("flags a bogus qualified ref end to end but passes a known one", () => {
    const root = makeRepo();
    writeFileSync(
      join(root, "CLAUDE.md"),
      ["use `/idea-to-prod:automate`", "and `/idea-to-prod:bogus`"].join("\n")
    );
    expect(findUnresolvedReferences(root)).toEqual([
      { file: "CLAUDE.md", line: 2, name: "idea-to-prod:bogus" },
    ]);
  });
});

describe("extractSkillReferences", () => {
  it("finds backticked commands with their line numbers", () => {
    const md = ["intro", "run `/implement-queue` then `/site-audit`", "", "and `/deploy`"].join(
      "\n"
    );
    expect(extractSkillReferences(md)).toEqual([
      { name: "implement-queue", line: 2 },
      { name: "site-audit", line: 2 },
      { name: "deploy", line: 4 },
    ]);
  });

  it("ignores multi-segment paths, which are routes not commands", () => {
    const md = "POST `/api/v1/venues` and `/public/v1/venues/x/holds`";
    expect(extractSkillReferences(md)).toEqual([]);
  });

  it("ignores an unbackticked mention, which cannot be told from prose", () => {
    expect(extractSkillReferences("the /reflect idea was never built")).toEqual([]);
  });
});

describe("collectInstructionFiles", () => {
  it("includes the instruction surface and excludes routes and history", () => {
    const root = makeRepo();
    writeFileSync(join(root, "CLAUDE.md"), "root\n");
    writeFileSync(join(root, "AGENTS.md"), "agents\n");
    mkdirSync(join(root, ".claude/rules"), { recursive: true });
    writeFileSync(join(root, ".claude/rules/gotchas.md"), "rules\n");
    addSkill(root, "deploy");
    mkdirSync(join(root, "apps/hospitality"), { recursive: true });
    writeFileSync(join(root, "apps/hospitality/CLAUDE.md"), "route `/timeline`\n");
    mkdirSync(join(root, ".claude/improvement-loop"), { recursive: true });
    writeFileSync(join(root, ".claude/improvement-loop/README.md"), "ran `/ship-loop`\n");

    const files = collectInstructionFiles(root);

    expect(files).toContain("CLAUDE.md");
    expect(files).toContain("AGENTS.md");
    expect(files).toContain(".claude/rules/gotchas.md");
    expect(files).toContain(".claude/skills/deploy/SKILL.md");
    expect(files).not.toContain("apps/hospitality/CLAUDE.md");
    expect(files).not.toContain(".claude/improvement-loop/README.md");
  });
});

describe("findUnresolvedReferences", () => {
  // Names here must be absent from DECLARED_NON_REPO_REFERENCES, which
  // findUnresolvedReferences consults directly — `/reflect` is listed there
  // and so would pass even in a fixture repo that never mentions it.
  it("flags a command that names no skill", () => {
    const root = makeRepo();
    addSkill(root, "gotcha-harvest");
    writeFileSync(
      join(root, "CLAUDE.md"),
      ["run `/gotcha-harvest` after a loop", "then run `/never-built` at session end"].join("\n")
    );

    expect(findUnresolvedReferences(root)).toEqual([
      { file: "CLAUDE.md", line: 2, name: "never-built" },
    ]);
  });

  it("passes once the fiction is actually built", () => {
    const root = makeRepo();
    addSkill(root, "never-built");
    writeFileSync(join(root, "CLAUDE.md"), "run `/never-built` at session end\n");

    expect(findUnresolvedReferences(root)).toEqual([]);
  });
});

describe("findPluginNameCollisions", () => {
  // A repo-local skill that shares a plugin skill's bare name shadows it in a
  // local session (#6835 retired `prisma-migrations` for exactly this).
  it("flags a repo skill named like a plugin skill", () => {
    const root = makeRepo();
    addSkill(root, "review");
    addSkill(root, "site-audit");

    expect(findPluginNameCollisions(root, {})).toEqual([
      { name: "review", plugin: "idea-to-prod" },
    ]);
  });

  it("passes a collision allowlisted with a reason", () => {
    const root = makeRepo();
    addSkill(root, "review");

    expect(findPluginNameCollisions(root, { review: "a different skill on purpose" })).toEqual([]);
  });
});

describe("the real repo", () => {
  it("has no repo-local skill shadowing a plugin skill unless declared", () => {
    expect(findPluginNameCollisions()).toEqual([]);
  });

  it("gives every declared collision a reviewable reason", () => {
    for (const [name, reason] of Object.entries(DECLARED_PLUGIN_NAME_COLLISIONS)) {
      expect(reason.length, `${name} collision reason is too terse to review`).toBeGreaterThan(20);
    }
  });

  it("names no slash-command that resolves to nothing", () => {
    expect(findUnresolvedReferences()).toEqual([]);
  });

  it("gives every declared reference a non-empty reason", () => {
    for (const [name, reason] of Object.entries(DECLARED_NON_REPO_REFERENCES)) {
      expect(reason, `/${name} needs a reason`).toBeTruthy();
      expect(reason.length, `/${name} reason is too terse to review`).toBeGreaterThan(20);
    }
  });
});
