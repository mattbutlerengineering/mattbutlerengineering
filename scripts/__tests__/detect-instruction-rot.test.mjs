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
