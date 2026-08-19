import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("check-env-sync", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-sync-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("collectEnvVars", () => {
    test("finds process.env.VAR references", async () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "const x = process.env.MY_VAR;\n");

      const { collectEnvVars } = await import("../check-env-sync.js");
      const vars = collectEnvVars(tmpDir);

      expect(vars.has("MY_VAR")).toBe(true);
    });

    test("finds import.meta.env.VAR references", async () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "src", "index.ts"),
        "const x = import.meta.env.VITE_KEY;\n"
      );

      const { collectEnvVars } = await import("../check-env-sync.js");
      const vars = collectEnvVars(tmpDir);

      expect(vars.has("VITE_KEY")).toBe(true);
    });

    test("ignores test files and node_modules", async () => {
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "src", "index.test.ts"), "process.env.TEST_ONLY;\n");
      fs.writeFileSync(
        path.join(tmpDir, "node_modules", "pkg", "index.ts"),
        "process.env.DEP_VAR;\n"
      );

      const { collectEnvVars } = await import("../check-env-sync.js");
      const vars = collectEnvVars(tmpDir);

      expect(vars.has("TEST_ONLY")).toBe(false);
      expect(vars.has("DEP_VAR")).toBe(false);
    });
  });

  describe("parseEnvExample", () => {
    test("parses active and commented-out vars", async () => {
      const filePath = path.join(tmpDir, ".env.example");
      fs.writeFileSync(filePath, "MY_VAR=value\n# OTHER_VAR=commented\n");

      const { parseEnvExample } = await import("../check-env-sync.js");
      const vars = parseEnvExample(filePath);

      expect(vars.has("MY_VAR")).toBe(true);
      expect(vars.has("OTHER_VAR")).toBe(true);
    });

    test("returns an empty set when the file doesn't exist", async () => {
      const { parseEnvExample } = await import("../check-env-sync.js");
      const vars = parseEnvExample(path.join(tmpDir, "missing.env.example"));

      expect(vars.size).toBe(0);
    });
  });

  describe("findEnvSyncFindings", () => {
    test("reports missing vars for a package with an incomplete .env.example", async () => {
      const pkgDir = path.join(tmpDir, "services", "widgets");
      fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "src", "index.ts"), "process.env.SECRET_KEY;\n");
      fs.writeFileSync(path.join(pkgDir, ".env.example"), "OTHER_VAR=1\n");

      const { findEnvSyncFindings } = await import("../check-env-sync.js");
      const results = findEnvSyncFindings(tmpDir);

      const widgets = results.find((r) => r.packageRelativePath.includes("widgets"));
      expect(widgets.missing).toContain("SECRET_KEY");
    });

    test("reports no missing vars when .env.example documents everything", async () => {
      const pkgDir = path.join(tmpDir, "services", "widgets");
      fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "src", "index.ts"), "process.env.SECRET_KEY;\n");
      fs.writeFileSync(path.join(pkgDir, ".env.example"), "SECRET_KEY=1\n");

      const { findEnvSyncFindings } = await import("../check-env-sync.js");
      const results = findEnvSyncFindings(tmpDir);

      const widgets = results.find((r) => r.packageRelativePath.includes("widgets"));
      expect(widgets.missing).toHaveLength(0);
    });

    test("ignores platform-injected vars like NODE_ENV", async () => {
      const pkgDir = path.join(tmpDir, "services", "widgets");
      fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "src", "index.ts"), "process.env.NODE_ENV;\n");
      fs.writeFileSync(path.join(pkgDir, ".env.example"), "UNRELATED=1\n");

      const { findEnvSyncFindings } = await import("../check-env-sync.js");
      const results = findEnvSyncFindings(tmpDir);

      const widgets = results.find((r) => r.packageRelativePath.includes("widgets"));
      expect(widgets.missing).not.toContain("NODE_ENV");
    });
  });

  describe("findEnvSyncFindings — shared package attribution", () => {
    function writeServiceWithSharedDep(tmpRoot, envExampleContent) {
      const sharedDir = path.join(tmpRoot, "packages", "shared");
      fs.mkdirSync(path.join(sharedDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(sharedDir, "package.json"),
        JSON.stringify({ name: "@acme/shared" })
      );
      fs.writeFileSync(
        path.join(sharedDir, "src", "index.ts"),
        "export const x = process.env.SHARED_SECRET;\n"
      );

      const serviceDir = path.join(tmpRoot, "services", "widgets");
      fs.mkdirSync(path.join(serviceDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(serviceDir, "package.json"),
        JSON.stringify({ name: "widgets-service", dependencies: { "@acme/shared": "workspace:*" } })
      );
      fs.writeFileSync(path.join(serviceDir, "src", "index.ts"), "process.env.SECRET_KEY;\n");
      fs.writeFileSync(path.join(serviceDir, ".env.example"), envExampleContent);
    }

    test("a var read only by a workspace dependency of a service produces a finding", async () => {
      writeServiceWithSharedDep(tmpDir, "SECRET_KEY=1\n");

      const { findEnvSyncFindings } = await import("../check-env-sync.js");
      const results = findEnvSyncFindings(tmpDir);

      const widgets = results.find((r) => r.packageRelativePath.includes("widgets"));
      expect(widgets.missing).toContain("SHARED_SECRET");
    });

    test("documenting the shared package's var in the service's .env.example clears the finding", async () => {
      writeServiceWithSharedDep(tmpDir, "SECRET_KEY=1\nSHARED_SECRET=1\n");

      const { findEnvSyncFindings } = await import("../check-env-sync.js");
      const results = findEnvSyncFindings(tmpDir);

      const widgets = results.find((r) => r.packageRelativePath.includes("widgets"));
      expect(widgets.missing).not.toContain("SHARED_SECRET");
    });
  });
});
