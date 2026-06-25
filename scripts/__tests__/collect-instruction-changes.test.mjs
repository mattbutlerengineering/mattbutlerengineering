import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseGitLog,
  buildInstructionEntry,
  collectInstructionChanges,
} from "../collect-instruction-changes.mjs";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "instruction-changes-test-"));
}

describe("parseGitLog", () => {
  it("extracts date, file, and summary from git log output", () => {
    const logOutput = `2026-06-21 chore(mcp): add Stripe MCP server (test-mode) for payment-path development (#2575)
CLAUDE.md
.claude/rules/gotchas.md

2026-06-20 test(reservations): end-to-end route ownership enforcement (#2514)
services/reservations/CLAUDE.md

`;
    const entries = parseGitLog(logOutput);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      date: "2026-06-21",
      file: "CLAUDE.md",
      summary: "chore(mcp): add Stripe MCP server (test-mode) for payment-path development (#2575)",
    });
    expect(entries[1]).toMatchObject({
      date: "2026-06-21",
      file: ".claude/rules/gotchas.md",
      summary: "chore(mcp): add Stripe MCP server (test-mode) for payment-path development (#2575)",
    });
    expect(entries[2]).toMatchObject({
      date: "2026-06-20",
      file: "services/reservations/CLAUDE.md",
      summary: "test(reservations): end-to-end route ownership enforcement (#2514)",
    });
  });

  it("ignores empty lines and file names that are generated artifacts", () => {
    const logOutput = `2026-06-21 docs: update docs
CLAUDE.md
llms.txt
llms-full.txt

`;
    const entries = parseGitLog(logOutput);
    expect(entries).toHaveLength(1);
    expect(entries[0].file).toBe("CLAUDE.md");
  });

  it("returns empty array for empty input", () => {
    expect(parseGitLog("")).toEqual([]);
    expect(parseGitLog("\n\n")).toEqual([]);
  });

  it("skips files under src/generated/ or dist/", () => {
    const logOutput = `2026-06-21 chore(build): regenerate artifacts
packages/foo/src/generated/index.ts
packages/bar/dist/index.js
CLAUDE.md

`;
    const entries = parseGitLog(logOutput);
    expect(entries).toHaveLength(1);
    expect(entries[0].file).toBe("CLAUDE.md");
  });
});

describe("buildInstructionEntry", () => {
  it("builds entry with inferred change_type from commit message prefix", () => {
    const entry = buildInstructionEntry("2026-06-21", "CLAUDE.md", "docs(claude): add new section");
    expect(entry).toMatchObject({
      date: "2026-06-21",
      file: "CLAUDE.md",
      summary: "docs(claude): add new section",
      change_type: "documentation",
    });
  });

  it('maps "feat:" to "addition"', () => {
    const entry = buildInstructionEntry(
      "2026-06-21",
      "CLAUDE.md",
      "feat(auth): add new auth provider"
    );
    expect(entry.change_type).toBe("addition");
  });

  it('maps "fix:" to "correction"', () => {
    const entry = buildInstructionEntry(
      "2026-06-21",
      ".claude/rules/gotchas.md",
      "fix(gotchas): clarify prisma migration gotcha"
    );
    expect(entry.change_type).toBe("correction");
  });

  it('maps "docs:" to "documentation"', () => {
    const entry = buildInstructionEntry("2026-06-21", "AGENTS.md", "docs: update ADR guidelines");
    expect(entry.change_type).toBe("documentation");
  });

  it('maps "refactor:" to "update"', () => {
    const entry = buildInstructionEntry("2026-06-21", "CLAUDE.md", "refactor: reorganize sections");
    expect(entry.change_type).toBe("update");
  });

  it('defaults to "update" for unknown prefix', () => {
    const entry = buildInstructionEntry("2026-06-21", "CLAUDE.md", "some random commit message");
    expect(entry.change_type).toBe("update");
  });
});

describe("collectInstructionChanges", () => {
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("creates metrics file and appends new entries", () => {
    const metricsPath = join(dir, "instruction-changes.jsonl");
    const lastDate = "2026-06-20";

    collectInstructionChanges(
      metricsPath,
      lastDate,
      `2026-06-21 chore(mcp): add Stripe MCP server (#2575)
CLAUDE.md

2026-06-20 feat(skills): add new skill
.claude/skills/my-skill/SKILL.md

`
    );

    expect(
      readFileSync(metricsPath, "utf-8")
        .split("\n")
        .filter((l) => l.trim())
    ).toHaveLength(1);
    const entry = JSON.parse(readFileSync(metricsPath, "utf-8").split("\n")[0]);
    expect(entry.date).toBe("2026-06-21");
    expect(entry.file).toBe("CLAUDE.md");
  });

  it("appends to existing metrics file", () => {
    const metricsPath = join(dir, "instruction-changes.jsonl");
    const existing = {
      date: "2026-06-20",
      file: "CLAUDE.md",
      summary: "old change",
      change_type: "documentation",
    };
    writeFileSync(metricsPath, JSON.stringify(existing) + "\n");

    const lastDate = "2026-06-20";
    collectInstructionChanges(
      metricsPath,
      lastDate,
      `2026-06-21 chore(mcp): add Stripe MCP server (#2575)
CLAUDE.md

`
    );

    const lines = readFileSync(metricsPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).date).toBe("2026-06-20");
    expect(JSON.parse(lines[1]).date).toBe("2026-06-21");
  });

  it("excludes entries not after lastDate", () => {
    const metricsPath = join(dir, "instruction-changes.jsonl");
    const lastDate = "2026-06-20";

    collectInstructionChanges(
      metricsPath,
      lastDate,
      `2026-06-21 new change
CLAUDE.md

2026-06-20 old change
CLAUDE.md

2026-06-19 very old change
CLAUDE.md

`
    );

    const lines = readFileSync(metricsPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).date).toBe("2026-06-21");
  });

  it("returns the count of new entries written", () => {
    const metricsPath = join(dir, "instruction-changes.jsonl");
    const lastDate = "2026-06-20";

    const count = collectInstructionChanges(
      metricsPath,
      lastDate,
      `2026-06-21 change 1
CLAUDE.md

2026-06-22 change 2
CLAUDE.md

`
    );

    expect(count).toBe(2);
  });
});
