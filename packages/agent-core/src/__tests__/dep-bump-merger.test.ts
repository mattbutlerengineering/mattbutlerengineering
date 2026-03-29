import { describe, it, expect } from "vitest";
import { isTrivialDepBump } from "../dep-bump-merger.js";

// ── Diff fixtures ────────────────────────────────────────────────────

/**
 * Minimal unified diff touching only package.json (a typical single-package
 * version bump — well under the 20-line limit).
 */
const PACKAGE_JSON_ONLY_DIFF = `diff --git a/package.json b/package.json
index 1234567..abcdefg 100644
--- a/package.json
+++ b/package.json
@@ -5,7 +5,7 @@ {
   "dependencies": {
-    "lodash": "4.17.20",
+    "lodash": "4.17.21",
   }
 }
`;

/**
 * Diff that also touches pnpm-lock.yaml (normal for pnpm installs).
 * The non-lockfile portion is still tiny.
 */
const PACKAGE_JSON_AND_LOCKFILE_DIFF = `diff --git a/package.json b/package.json
index 1234567..abcdefg 100644
--- a/package.json
+++ b/package.json
@@ -5,7 +5,7 @@ {
   "dependencies": {
-    "axios": "1.6.0",
+    "axios": "1.7.0",
   }
 }
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index aaaaaaa..bbbbbbb 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1,10 +1,10 @@
-  axios: 1.6.0
+  axios: 1.7.0
`;

/**
 * Workspace monorepo layout: package.json lives under apps/marketing/.
 */
const WORKSPACE_PACKAGE_JSON_DIFF = `diff --git a/apps/marketing/package.json b/apps/marketing/package.json
index 1111111..2222222 100644
--- a/apps/marketing/package.json
+++ b/apps/marketing/package.json
@@ -3,3 +3,3 @@
-    "react": "18.2.0",
+    "react": "18.3.0",
`;

/**
 * Diff that also touches a source file — NOT trivial.
 */
const SOURCE_FILE_CHANGED_DIFF = `diff --git a/package.json b/package.json
index 1234567..abcdefg 100644
--- a/package.json
+++ b/package.json
@@ -5,7 +5,7 @@ {
-    "zod": "3.22.0",
+    "zod": "3.23.0",
 }
diff --git a/src/validation.ts b/src/validation.ts
index aaaaaaa..bbbbbbb 100644
--- a/src/validation.ts
+++ b/src/validation.ts
@@ -1,3 +1,5 @@
+import { z } from "zod";
+export const schema = z.string();
`;

/**
 * Diff whose non-lockfile portion exceeds the 20-line threshold.
 */
function buildLargePackageJsonDiff(): string {
  const removedLines = Array.from(
    { length: 12 },
    (_, i) => `-    "dep-${i}": "1.0.${i}",`
  ).join("\n");
  const addedLines = Array.from(
    { length: 12 },
    (_, i) => `+    "dep-${i}": "1.0.${i + 1}",`
  ).join("\n");

  return [
    "diff --git a/package.json b/package.json",
    "index 1234567..abcdefg 100644",
    "--- a/package.json",
    "+++ b/package.json",
    "@@ -5,20 +5,20 @@ {",
    removedLines,
    addedLines,
    "",
  ].join("\n");
}

// ── Tests ────────────────────────────────────────────────────────────

describe("isTrivialDepBump", () => {
  describe("returns isTrivial: true", () => {
    it("when only package.json is changed with a small diff", () => {
      const result = isTrivialDepBump(PACKAGE_JSON_ONLY_DIFF);
      expect(result.isTrivial).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("when package.json and pnpm-lock.yaml are both changed", () => {
      const result = isTrivialDepBump(PACKAGE_JSON_AND_LOCKFILE_DIFF);
      expect(result.isTrivial).toBe(true);
    });

    it("when package.json is in a workspace subdirectory", () => {
      const result = isTrivialDepBump(WORKSPACE_PACKAGE_JSON_DIFF);
      expect(result.isTrivial).toBe(true);
    });

    it("when only pnpm-lock.yaml is changed (lockfile-only sync)", () => {
      const lockOnlyDiff = `diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index aaaaaaa..bbbbbbb 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1,3 +1,3 @@
-  some-dep: 1.0.0
+  some-dep: 1.0.1
`;
      const result = isTrivialDepBump(lockOnlyDiff);
      expect(result.isTrivial).toBe(true);
    });
  });

  describe("returns isTrivial: false", () => {
    it("when the diff is empty", () => {
      const result = isTrivialDepBump("");
      expect(result.isTrivial).toBe(false);
      expect(result.reason).toContain("Empty diff");
    });

    it("when a source file is also changed", () => {
      const result = isTrivialDepBump(SOURCE_FILE_CHANGED_DIFF);
      expect(result.isTrivial).toBe(false);
      expect(result.reason).toContain("src/validation.ts");
    });

    it("when the non-lockfile diff exceeds the 20-line limit", () => {
      const largeDiff = buildLargePackageJsonDiff();
      const result = isTrivialDepBump(largeDiff);
      expect(result.isTrivial).toBe(false);
      expect(result.reason).toMatch(/\d+ changed lines/);
    });

    it("when a migration file is changed alongside package.json", () => {
      const migrationDiff = `diff --git a/package.json b/package.json
index 1234567..abcdefg 100644
--- a/package.json
+++ b/package.json
@@ -5,3 +5,3 @@
-    "prisma": "5.10.0",
+    "prisma": "5.11.0",
diff --git a/prisma/migrations/001_init.sql b/prisma/migrations/001_init.sql
index aaaaaaa..bbbbbbb 100644
--- a/prisma/migrations/001_init.sql
+++ b/prisma/migrations/001_init.sql
@@ -1 +1 @@
-CREATE TABLE users ();
+CREATE TABLE users (id TEXT);
`;
      const result = isTrivialDepBump(migrationDiff);
      expect(result.isTrivial).toBe(false);
      expect(result.reason).toContain("prisma/migrations/001_init.sql");
    });

    it("when diff has no parseable file headers", () => {
      const result = isTrivialDepBump("not a real diff\njust some text");
      expect(result.isTrivial).toBe(false);
      expect(result.reason).toContain("Could not detect changed files");
    });
  });

  describe("edge cases", () => {
    it("handles whitespace-only diff", () => {
      const result = isTrivialDepBump("   \n\t\n  ");
      expect(result.isTrivial).toBe(false);
    });

    it("allows exactly 19 non-lockfile changed lines", () => {
      // Build a diff with exactly 19 changed lines (below the limit of 20)
      const lines = Array.from({ length: 10 }, (_, i) => `-    "d${i}": "1.${i}",`);
      const plusLines = Array.from({ length: 9 }, (_, i) => `+    "d${i}": "2.${i}",`);
      const diff = [
        "diff --git a/package.json b/package.json",
        "index 1234567..abcdefg 100644",
        "--- a/package.json",
        "+++ b/package.json",
        "@@ -1,10 +1,10 @@",
        ...lines,
        ...plusLines,
      ].join("\n");

      const result = isTrivialDepBump(diff);
      expect(result.isTrivial).toBe(true);
    });

    it("rejects exactly 20 non-lockfile changed lines", () => {
      const lines = Array.from({ length: 10 }, (_, i) => `-    "d${i}": "1.${i}",`);
      const plusLines = Array.from({ length: 10 }, (_, i) => `+    "d${i}": "2.${i}",`);
      const diff = [
        "diff --git a/package.json b/package.json",
        "index 1234567..abcdefg 100644",
        "--- a/package.json",
        "+++ b/package.json",
        "@@ -1,10 +1,10 @@",
        ...lines,
        ...plusLines,
      ].join("\n");

      const result = isTrivialDepBump(diff);
      expect(result.isTrivial).toBe(false);
    });

    it("lockfile lines do NOT count toward the 20-line limit", () => {
      // Large lockfile diff but tiny package.json diff — should still be trivial
      const lockfileLines = Array.from(
        { length: 100 },
        (_, i) => `+  resolution-${i}: 1.0.0`
      ).join("\n");

      const diff = [
        "diff --git a/package.json b/package.json",
        "index 1234567..abcdefg 100644",
        "--- a/package.json",
        "+++ b/package.json",
        "@@ -3,3 +3,3 @@",
        `-    "react": "18.2.0",`,
        `+    "react": "18.3.0",`,
        "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml",
        "index aaaaaaa..bbbbbbb 100644",
        "--- a/pnpm-lock.yaml",
        "+++ b/pnpm-lock.yaml",
        "@@ -1,100 +1,100 @@",
        lockfileLines,
      ].join("\n");

      const result = isTrivialDepBump(diff);
      expect(result.isTrivial).toBe(true);
    });
  });
});
