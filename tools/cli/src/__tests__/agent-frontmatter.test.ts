/**
 * Tests for the `mbe agent frontmatter` subcommand (#2021).
 * Reads an issue body (--body-file or stdin), prints `mbe agent run` flags
 * to stdout and warnings to stderr. Always exits 0 — the issue-worker loop
 * must never crash on a bad agent block.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { frontmatterCommand } from "../commands/agent-frontmatter.js";

describe("agent frontmatter subcommand", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    tmpDir = mkdtempSync(join(tmpdir(), "frontmatter-test-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const writeBody = (content: string): string => {
    const file = join(tmpDir, "body.md");
    writeFileSync(file, content);
    return file;
  };

  it("prints flags for a valid agent block", async () => {
    const file = writeBody("## Task\n\n```yaml agent\nmodel: haiku\nbudget: 0.5\n```\n");
    await frontmatterCommand.parseAsync(["--body-file", file], { from: "user" });
    expect(logSpy).toHaveBeenCalledWith("--model claude-haiku-4-5-20251001 --max-budget 0.5");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("prints an empty line when no agent block exists", async () => {
    const file = writeBody("## Task\n\nNo block here.\n");
    await frontmatterCommand.parseAsync(["--body-file", file], { from: "user" });
    expect(logSpy).toHaveBeenCalledWith("");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns to stderr and prints empty flags on malformed yaml", async () => {
    const file = writeBody("```yaml agent\nmodel: [unclosed\n```\n");
    await frontmatterCommand.parseAsync(["--body-file", file], { from: "user" });
    expect(logSpy).toHaveBeenCalledWith("");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("warns but still prints valid flags when some fields are invalid", async () => {
    const file = writeBody("```yaml agent\nmodel: gpt-5\nadapter: auto\n```\n");
    await frontmatterCommand.parseAsync(["--body-file", file], { from: "user" });
    expect(logSpy).toHaveBeenCalledWith("--adapter auto");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("warns and prints empty flags for an unreadable body file", async () => {
    await frontmatterCommand.parseAsync(["--body-file", join(tmpDir, "missing.md")], {
      from: "user",
    });
    expect(logSpy).toHaveBeenCalledWith("");
    expect(warnSpy).toHaveBeenCalled();
  });
});
