import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = path.resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "detect-instruction-rot.mjs"
);

describe("detect-instruction-rot", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "instruction-rot-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("findDeadLinkFindings", () => {
    test("flags a markdown link whose target does not exist", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "CLAUDE.md"),
        "See [guide](./docs/guide.md) for details.\n"
      );

      const { findDeadLinkFindings } = await import("../detect-instruction-rot.mjs");
      const findings = findDeadLinkFindings(tmpDir, ["CLAUDE.md"]);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ file: "CLAUDE.md", type: "dead-link" });
    });

    test("does not flag a link whose target exists", async () => {
      fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "docs", "guide.md"), "# Guide\n");
      fs.writeFileSync(
        path.join(tmpDir, "CLAUDE.md"),
        "See [guide](./docs/guide.md) for details.\n"
      );

      const { findDeadLinkFindings } = await import("../detect-instruction-rot.mjs");
      const findings = findDeadLinkFindings(tmpDir, ["CLAUDE.md"]);

      expect(findings).toHaveLength(0);
    });

    test("skips files that don't exist", async () => {
      const { findDeadLinkFindings } = await import("../detect-instruction-rot.mjs");
      const findings = findDeadLinkFindings(tmpDir, ["GEMINI.md"]);

      expect(findings).toHaveLength(0);
    });
  });

  describe("findDeletedPackageOrAppFindings", () => {
    test("flags a reference to a deleted package", async () => {
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "See packages/gone-pkg for details.\n");

      const { findDeletedPackageOrAppFindings } = await import("../detect-instruction-rot.mjs");
      const findings = findDeletedPackageOrAppFindings(tmpDir, ["AGENTS.md"]);

      expect(findings).toContainEqual(
        expect.objectContaining({
          file: "AGENTS.md",
          type: "deleted-package",
          reference: "packages/gone-pkg",
        })
      );
    });

    test("does not flag an existing package reference", async () => {
      fs.mkdirSync(path.join(tmpDir, "packages", "real-pkg"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "See packages/real-pkg for details.\n");

      const { findDeletedPackageOrAppFindings } = await import("../detect-instruction-rot.mjs");
      const findings = findDeletedPackageOrAppFindings(tmpDir, ["AGENTS.md"]);

      expect(findings).toHaveLength(0);
    });

    test("flags a reference to a deleted app", async () => {
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "See apps/gone-app for details.\n");

      const { findDeletedPackageOrAppFindings } = await import("../detect-instruction-rot.mjs");
      const findings = findDeletedPackageOrAppFindings(tmpDir, ["AGENTS.md"]);

      expect(findings).toContainEqual(
        expect.objectContaining({
          file: "AGENTS.md",
          type: "deleted-app",
          reference: "apps/gone-app",
        })
      );
    });
  });

  describe("rules discovery", () => {
    test("discovers every .claude/rules/*.md file by glob", async () => {
      fs.mkdirSync(path.join(tmpDir, ".claude", "rules"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, ".claude", "rules", "new-rule.md"),
        "See [x](./gone.md)\n"
      );
      fs.writeFileSync(path.join(tmpDir, ".claude", "rules", "notes.txt"), "ignored\n");

      const { discoverInstructionFiles, findInstructionRotFindings } =
        await import("../detect-instruction-rot.mjs");

      expect(discoverInstructionFiles(tmpDir)).toContain(".claude/rules/new-rule.md");
      expect(discoverInstructionFiles(tmpDir)).not.toContain(".claude/rules/notes.txt");
      expect(findInstructionRotFindings(tmpDir)).toContainEqual(
        expect.objectContaining({ file: ".claude/rules/new-rule.md", type: "dead-link" })
      );
    });
  });

  describe("findStaleReferenceFindings", () => {
    const run = async (body) => {
      fs.mkdirSync(path.join(tmpDir, ".claude", "skills", "real-skill"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "scripts", "real.mjs"), "");
      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), body);
      const { findStaleReferenceFindings } = await import("../detect-instruction-rot.mjs");
      return findStaleReferenceFindings(tmpDir, ["CLAUDE.md"]);
    };

    test("flags a slash command that resolves to no skill", async () => {
      expect(await run("Run `/ghost-skill` now.\n")).toContainEqual(
        expect.objectContaining({ type: "stale-skill", reference: "/ghost-skill", line: 1 })
      );
    });

    test("flags a scripts/ path that does not exist", async () => {
      expect(await run("Run scripts/missing.mjs now.\n")).toContainEqual(
        expect.objectContaining({ type: "stale-script", reference: "scripts/missing.mjs" })
      );
    });

    test("does not flag allowlisted user-level skills", async () => {
      expect(await run("Use `/caveman` and `/tdd` locally.\n")).toEqual([]);
    });

    test("does not flag repo skills or existing scripts", async () => {
      expect(await run("Use `/real-skill` and scripts/real.mjs.\n")).toEqual([]);
    });

    test("ignores fenced code blocks and named rot-ignore markers", async () => {
      const body = [
        "```bash",
        "node scripts/example-only.mjs",
        "```",
        "Try scripts/illustrative.mjs <!-- rot-ignore: scripts/illustrative.mjs -->",
        "",
      ].join("\n");
      expect(await run(body)).toEqual([]);
    });

    test("a named rot-ignore exempts only the refs it names", async () => {
      const body =
        "Old scripts/gone-old.mjs vs scripts/gone-live.mjs <!-- rot-ignore: scripts/gone-old.mjs -->\n";
      const findings = await run(body);
      expect(findings.map((f) => f.reference)).toEqual(["scripts/gone-live.mjs"]);
    });

    test("a bare rot-ignore no longer exempts anything", async () => {
      expect(await run("See scripts/gone.mjs <!-- rot-ignore -->\n")).toHaveLength(1);
    });

    test("masks ~~~ fenced blocks", async () => {
      expect(await run("~~~bash\nnode scripts/example-only.mjs\n~~~\n")).toEqual([]);
    });

    test("a longer outer fence stays open through inner shorter fences", async () => {
      const body = [
        "````markdown",
        "```bash",
        "node scripts/inner.mjs",
        "```",
        "node scripts/after-inner-close.mjs",
        "````",
        "node scripts/outside.mjs",
        "",
      ].join("\n");
      const findings = await run(body);
      expect(findings.map((f) => f.reference)).toEqual(["scripts/outside.mjs"]);
    });

    test("a ~~~ line does not close a backtick fence", async () => {
      expect(await run("```\n~~~\nscripts/hidden.mjs\n```\n")).toEqual([]);
    });

    test("catches ./scripts/ paths", async () => {
      expect(await run("Run ./scripts/missing.mjs now.\n")).toContainEqual(
        expect.objectContaining({ type: "stale-script", reference: "scripts/missing.mjs" })
      );
    });

    test("a markdown link to a missing script is reported once, as a dead link", async () => {
      fs.mkdirSync(path.join(tmpDir, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "See [x](scripts/missing.mjs).\n");
      const { findInstructionRotFindings } = await import("../detect-instruction-rot.mjs");
      const findings = findInstructionRotFindings(tmpDir, ["CLAUDE.md"]);
      expect(findings.map((f) => f.type)).toEqual(["dead-link"]);
    });

    test("clean file yields no findings", async () => {
      expect(await run("Nothing to see.\n")).toEqual([]);
    });
  });

  describe("findInstructionRotFindings", () => {
    test("combines dead-link and deleted-package/app findings", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "CLAUDE.md"),
        "See [gone](./gone.md) and packages/gone-pkg and apps/gone-app.\n"
      );

      const { findInstructionRotFindings } = await import("../detect-instruction-rot.mjs");
      const findings = findInstructionRotFindings(tmpDir, ["CLAUDE.md"]);

      const types = findings.map((f) => f.type).sort();
      expect(types).toEqual(["dead-link", "deleted-app", "deleted-package"]);
    });
  });

  describe("hook seam (CLI process.exit behaviour)", () => {
    test("exits 0 when no rot is present", () => {
      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "Nothing to see here.\n");

      const result = spawnSync("node", [SCRIPT_PATH], {
        cwd: tmpDir,
        encoding: "utf-8",
        timeout: 15000,
      });

      expect(result.status).toBe(0);
    });

    test("exits non-zero when rot is detected", () => {
      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "See [gone](./gone.md) for details.\n");

      const result = spawnSync("node", [SCRIPT_PATH], {
        cwd: tmpDir,
        encoding: "utf-8",
        timeout: 15000,
      });

      expect(result.status).not.toBe(0);
    });
  });
});
