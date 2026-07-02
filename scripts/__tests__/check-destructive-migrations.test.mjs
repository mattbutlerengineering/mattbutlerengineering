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
  "check-destructive-migrations.js"
);

describe("check-destructive-migrations", () => {
  describe("scanMigrationContent", () => {
    test("detects an unapproved DROP TABLE", async () => {
      const { scanMigrationContent } = await import("../check-destructive-migrations.js");
      const result = scanMigrationContent("DROP TABLE users;");

      expect(result.hasApproval).toBe(false);
      expect(result.operations).toContain("DROP TABLE");
    });

    test("marks operations as approved when the DESTRUCTIVE marker is present", async () => {
      const { scanMigrationContent } = await import("../check-destructive-migrations.js");
      const result = scanMigrationContent("-- DESTRUCTIVE: intentional cleanup\nDROP TABLE users;");

      expect(result.hasApproval).toBe(true);
      expect(result.operations).toContain("DROP TABLE");
    });

    test("finds no operations in a benign migration", async () => {
      const { scanMigrationContent } = await import("../check-destructive-migrations.js");
      const result = scanMigrationContent("CREATE TABLE users (id TEXT PRIMARY KEY);");

      expect(result.operations).toHaveLength(0);
    });
  });

  describe("findDestructiveMigrationFindings", () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "destructive-migrations-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test("reports a finding for an unapproved destructive file", async () => {
      const file = path.join(tmpDir, "20260101_drop.sql");
      fs.writeFileSync(file, "DROP TABLE users;");

      const { findDestructiveMigrationFindings } =
        await import("../check-destructive-migrations.js");
      const { findings, approved } = findDestructiveMigrationFindings([file]);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ file, operation: "DROP TABLE" });
      expect(approved).toHaveLength(0);
    });

    test("moves approved operations into the approved list, not findings", async () => {
      const file = path.join(tmpDir, "20260101_drop.sql");
      fs.writeFileSync(file, "-- DESTRUCTIVE: reason\nDROP TABLE users;");

      const { findDestructiveMigrationFindings } =
        await import("../check-destructive-migrations.js");
      const { findings, approved } = findDestructiveMigrationFindings([file]);

      expect(findings).toHaveLength(0);
      expect(approved).toHaveLength(1);
    });

    test("skips files that no longer exist on disk", async () => {
      const { findDestructiveMigrationFindings } =
        await import("../check-destructive-migrations.js");
      const { findings, approved } = findDestructiveMigrationFindings([
        path.join(tmpDir, "does-not-exist.sql"),
      ]);

      expect(findings).toHaveLength(0);
      expect(approved).toHaveLength(0);
    });
  });

  describe("hook seam (CLI process.exit behaviour)", () => {
    // The CLI computes new-migration files via `git diff`, so exercise it
    // through a real invocation from the actual repo (no destructive
    // migrations expected on a clean tree against origin/main).
    test("exits 0 when there are no new destructive migrations", () => {
      const result = spawnSync("node", [SCRIPT_PATH, "HEAD"], {
        encoding: "utf-8",
        timeout: 15000,
      });

      expect(result.status).toBe(0);
    });
  });
});
