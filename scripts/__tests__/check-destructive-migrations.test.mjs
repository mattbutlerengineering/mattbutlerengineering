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

// #10143: an unresolvable base is an environmental blocker, reported as BLOCKED by repo-audit.
const BASE_UNRESOLVABLE_EXIT = 10;

/** A throwaway repo whose origin/main is the base commit, plus `files` committed on top. */
function fixtureRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "destructive-mig-"));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf-8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("commit", "-q", "--allow-empty", "-m", "base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  git("add", "-A");
  git("commit", "-q", "-m", "migration");
  return dir;
}

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

    // This gate can only see a migration by diffing HEAD against a base, so a
    // base it cannot resolve means it inspected nothing — the only honest
    // answer is to fail. It used to swallow the failure, fall back to an
    // (empty) `--cached` diff and print "No new migration files found", which
    // is indistinguishable from a real all-clear at the exit code. Measured:
    // the same unapproved `DROP COLUMN` exits 1 against a resolvable base and
    // exited 0 against an unresolvable one. Same fail-closed stance
    // check-rialto-changeset.mjs already takes for the identical condition.
    test("fails closed when the diff base cannot be resolved", () => {
      const result = spawnSync("node", [SCRIPT_PATH, "refs/heads/no-such-base-ref"], {
        encoding: "utf-8",
        timeout: 15000,
      });

      expect(result.status).toBe(BASE_UNRESOLVABLE_EXIT);
      expect(result.stdout).toContain("could not resolve a diff base");
    });

    // Asserted with a base that cannot resolve, not a working one: a
    // resolvable override is indistinguishable from the default origin/main
    // path, so the test would pass even if the env var were never read.
    test("honours the DESTRUCTIVE_MIGRATION_BASE override", () => {
      const result = spawnSync("node", [SCRIPT_PATH], {
        encoding: "utf-8",
        timeout: 15000,
        env: { ...process.env, DESTRUCTIVE_MIGRATION_BASE: "refs/heads/no-such-base-ref" },
      });

      expect(result.status).toBe(BASE_UNRESOLVABLE_EXIT);
      expect(result.stdout).toContain("could not resolve a diff base");
    });
  });

  describe("CLI against a fixture repo (#10143)", () => {
    const MIGRATION = "services/users-api/prisma/migrations/20260101_x/migration.sql";
    let dir;
    afterEach(() => {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    });

    test("blocks an unapproved destructive migration committed since origin/main", () => {
      dir = fixtureRepo({ [MIGRATION]: 'ALTER TABLE "Venue" DROP COLUMN "legacyId";\n' });
      const result = spawnSync("node", [SCRIPT_PATH], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 15000,
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("DROP COLUMN");
    });

    test("passes the same migration once it carries the approval marker", () => {
      dir = fixtureRepo({
        [MIGRATION]:
          '-- DESTRUCTIVE: legacy column unused since #1\nALTER TABLE "Venue" DROP COLUMN "legacyId";\n',
      });
      const result = spawnSync("node", [SCRIPT_PATH], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 15000,
      });
      expect(result.status).toBe(0);
    });

    test("treats a base ref that looks like an option as a ref, not a flag", () => {
      dir = fixtureRepo({ [MIGRATION]: 'ALTER TABLE "Venue" DROP COLUMN "legacyId";\n' });
      const result = spawnSync("node", [SCRIPT_PATH, "--octopus"], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 15000,
      });
      expect(result.status).toBe(BASE_UNRESOLVABLE_EXIT);
    });
  });

  describe("ci.yml migrations job checkout depth", () => {
    // Failing closed turns a silent miss into a red job, which only helps if
    // the job can resolve origin/main in the first place. It can today, but
    // only incidentally: the `fetch-depth: 0` it relies on is commented as
    // being for the PR-only dry-run steps, so moving those steps elsewhere
    // would quietly take this guard's base away with nothing going red. This
    // pins the dependency so that removal breaks a test instead.
    const WORKFLOW = fs.readFileSync(
      path.resolve(SCRIPT_PATH, "..", "..", ".github/workflows/ci.yml"),
      "utf-8"
    );

    test("checks out full history so origin/main resolves", () => {
      const lines = WORKFLOW.split("\n");
      const jobStart = lines.findIndex((l) => /^ {2}migrations:\s*$/.test(l));
      expect(jobStart).toBeGreaterThan(-1);

      const after = lines.slice(jobStart + 1);
      const nextJobOffset = after.findIndex((l) => /^ {2}[a-z][a-z0-9-]*:\s*$/.test(l));
      const job = after.slice(0, nextJobOffset === -1 ? undefined : nextJobOffset).join("\n");

      expect(job).toContain("scripts/check-destructive-migrations.js");
      expect(job).toMatch(/fetch-depth:\s*0/);
    });
  });

  // #6291: the .claude/settings.json edit-time hook calls this mode instead of
  // restating the regex, so edit-time and CI share one rule.
  describe("--file (edit-time hook mode)", () => {
    let dir;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "destructive-file-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    function runFile(sql) {
      const file = path.join(dir, "migration.sql");
      fs.writeFileSync(file, sql);
      return spawnSync(process.execPath, [SCRIPT_PATH, "--file", file], { encoding: "utf-8" });
    }

    test("warns on stderr but exits 0 for an unapproved destructive migration", () => {
      const result = runFile("DROP TABLE users;");
      expect(result.status).toBe(0);
      expect(result.stderr).toContain("DESTRUCTIVE");
    });

    test.each([
      ["canonical marker", "-- DESTRUCTIVE: cleanup\nDROP TABLE users;"],
      ["no space after dashes", "--DESTRUCTIVE: cleanup\nDROP TABLE users;"],
      ["leading whitespace", "   -- DESTRUCTIVE: cleanup\nDROP TABLE users;"],
    ])("is silent when approved (%s), matching the CI rule", (_label, sql) => {
      const result = runFile(sql);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    });

    test("is silent for a benign migration", () => {
      const result = runFile("CREATE TABLE users (id TEXT PRIMARY KEY);");
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    });
  });
});
