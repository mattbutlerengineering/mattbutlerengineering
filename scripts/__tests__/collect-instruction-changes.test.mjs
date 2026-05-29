import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseGitLogOutput,
  classifyChangeType,
  deduplicateInstructionEntries,
  collectInstructionChanges,
} from "../collect-instruction-changes.mjs";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "instruction-collector-test-"));
}

describe("parseGitLogOutput", () => {
  it("parses git log lines into structured entries", () => {
    const gitOutput = [
      "2026-05-22\tCLAUDE.md\tdocs: add TDD enforcement and CI gotchas from /reflect session",
      "2026-05-19\tAGENTS.md\tdocs: add green-main CI policy and clean up stale gotchas (#1593)",
      "2026-05-17\tCLAUDE.md\tchore: audit and fix agent config files (#1490)",
    ].join("\n");

    const result = parseGitLogOutput(gitOutput);
    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject({
      date: "2026-05-22",
      file: "CLAUDE.md",
      summary: "docs: add TDD enforcement and CI gotchas from /reflect session",
    });
    expect(result[1].file).toBe("AGENTS.md");
  });

  it("returns empty array for empty output", () => {
    expect(parseGitLogOutput("")).toEqual([]);
    expect(parseGitLogOutput("   \n  \n  ")).toEqual([]);
  });

  it("skips lines that don't have the expected format", () => {
    const gitOutput = "malformed line\n2026-05-22\tCLAUDE.md\tgood line";
    const result = parseGitLogOutput(gitOutput);
    expect(result.length).toBe(1);
    expect(result[0].file).toBe("CLAUDE.md");
  });
});

describe("classifyChangeType", () => {
  it("classifies doc-type commits as documentation", () => {
    expect(classifyChangeType("docs: add TDD enforcement")).toBe("documentation");
    expect(classifyChangeType("docs(acmm): update scoring")).toBe("documentation");
  });

  it("classifies feat-type commits as addition", () => {
    expect(classifyChangeType("feat: enable caveman mode")).toBe("addition");
    expect(classifyChangeType("feat(acmm): add new criteria")).toBe("addition");
  });

  it("classifies fix-type commits as correction", () => {
    expect(classifyChangeType("fix: correct broken workflow")).toBe("correction");
  });

  it("classifies chore-type commits as maintenance", () => {
    expect(classifyChangeType("chore: audit and fix agent config")).toBe("maintenance");
    expect(classifyChangeType("refactor: reorganize skill files")).toBe("maintenance");
  });

  it("defaults to update for unrecognized patterns", () => {
    expect(classifyChangeType("updated instructions")).toBe("update");
  });
});

describe("deduplicateInstructionEntries", () => {
  it("removes entries that already exist based on date+file+summary", () => {
    const existing = [
      {
        date: "2026-05-22",
        file: "CLAUDE.md",
        change_type: "documentation",
        summary: "docs: add TDD",
      },
    ];
    const newEntries = [
      {
        date: "2026-05-22",
        file: "CLAUDE.md",
        change_type: "documentation",
        summary: "docs: add TDD",
      },
      {
        date: "2026-05-19",
        file: "AGENTS.md",
        change_type: "documentation",
        summary: "docs: add green-main CI policy",
      },
    ];

    const result = deduplicateInstructionEntries(newEntries, existing);
    expect(result.length).toBe(1);
    expect(result[0].file).toBe("AGENTS.md");
  });

  it("returns all entries when existing is empty", () => {
    const entries = [
      {
        date: "2026-05-22",
        file: "CLAUDE.md",
        change_type: "documentation",
        summary: "docs: add TDD",
      },
    ];
    expect(deduplicateInstructionEntries(entries, [])).toEqual(entries);
  });
});

describe("collectInstructionChanges", () => {
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
    mkdirSync(join(dir, "metrics"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("calls git log and writes entries to JSONL", async () => {
    const changesPath = join(dir, "metrics", "instruction-changes.jsonl");

    // Mock the git log function by providing custom gitLogFn
    const mockGitLog = () =>
      [
        "2026-05-22\tCLAUDE.md\tdocs: add TDD enforcement",
        "2026-05-19\tAGENTS.md\tdocs: add green-main CI policy (#1593)",
      ].join("\n");

    const count = collectInstructionChanges(dir, changesPath, mockGitLog);

    expect(count).toBe(2);
    expect(existsSync(changesPath)).toBe(true);
    const lines = readFileSync(changesPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    expect(lines.length).toBe(2);

    const entry = JSON.parse(lines[0]);
    expect(entry.file).toBe("CLAUDE.md");
    expect(entry.change_type).toBe("documentation");
    expect(entry.summary).toBe("docs: add TDD enforcement");
    expect(entry.date).toBe("2026-05-22");
  });

  it("does not duplicate entries already in JSONL", async () => {
    const changesPath = join(dir, "metrics", "instruction-changes.jsonl");
    writeFileSync(
      changesPath,
      JSON.stringify({
        date: "2026-05-22",
        file: "CLAUDE.md",
        change_type: "documentation",
        summary: "docs: add TDD enforcement",
      }) + "\n"
    );

    const mockGitLog = () => "2026-05-22\tCLAUDE.md\tdocs: add TDD enforcement";

    const count = collectInstructionChanges(dir, changesPath, mockGitLog);
    expect(count).toBe(0);

    const lines = readFileSync(changesPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    expect(lines.length).toBe(1);
  });

  it("returns 0 when git log returns empty output", () => {
    const changesPath = join(dir, "metrics", "instruction-changes.jsonl");
    const mockGitLog = () => "";

    const count = collectInstructionChanges(dir, changesPath, mockGitLog);
    expect(count).toBe(0);
    expect(existsSync(changesPath)).toBe(false);
  });

  it("handles skill file paths in addition to CLAUDE.md and AGENTS.md", () => {
    const changesPath = join(dir, "metrics", "instruction-changes.jsonl");
    const mockGitLog = () =>
      "2026-05-22\t.claude/skills/graphify/SKILL.md\tfeat: update graphify skill";

    const count = collectInstructionChanges(dir, changesPath, mockGitLog);
    expect(count).toBe(1);

    const lines = readFileSync(changesPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    const entry = JSON.parse(lines[0]);
    expect(entry.file).toBe(".claude/skills/graphify/SKILL.md");
    expect(entry.change_type).toBe("addition");
  });
});
