import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function writeService(root, name, { pkg, dockerfile }) {
  const dir = path.join(root, "services", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
  if (dockerfile !== undefined) {
    fs.writeFileSync(path.join(dir, "Dockerfile"), dockerfile);
  }
}

describe("check-dockerfile-deps", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerfile-deps-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("checkService", () => {
    test("is skipped when the service has no Dockerfile", async () => {
      writeService(tmpDir, "users", { pkg: { dependencies: {} } });

      const { checkService } = await import("../check-dockerfile-deps.js");
      const result = checkService("users", tmpDir);

      expect(result.skipped).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("reports no errors when all @mbe/* deps are COPYed", async () => {
      writeService(tmpDir, "users", {
        pkg: { dependencies: { "@mbe/types": "workspace:*" } },
        dockerfile: [
          "COPY packages/types/package.json ./packages/types/package.json",
          "COPY packages/types ./packages/types",
        ].join("\n"),
      });

      const { checkService } = await import("../check-dockerfile-deps.js");
      const result = checkService("users", tmpDir);

      expect(result.skipped).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    test("reports an error when a @mbe/* dep is missing its COPY step", async () => {
      writeService(tmpDir, "users", {
        pkg: { dependencies: { "@mbe/types": "workspace:*" } },
        dockerfile: "FROM node:22\n",
      });

      const { checkService } = await import("../check-dockerfile-deps.js");
      const result = checkService("users", tmpDir);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("@mbe/types");
    });

    test("ignores @mbe/config as a build-time-only dependency", async () => {
      writeService(tmpDir, "users", {
        pkg: { dependencies: { "@mbe/config": "workspace:*" } },
        dockerfile: "FROM node:22\n",
      });

      const { checkService } = await import("../check-dockerfile-deps.js");
      const result = checkService("users", tmpDir);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("findDockerfileDepsFindings", () => {
    test("aggregates findings across services, skipping ones with no Dockerfile", async () => {
      writeService(tmpDir, "users", {
        pkg: { dependencies: { "@mbe/types": "workspace:*" } },
        dockerfile: "FROM node:22\n",
      });
      writeService(tmpDir, "agent", { pkg: { dependencies: {} } });

      const { findDockerfileDepsFindings } = await import("../check-dockerfile-deps.js");
      const { results, findings } = findDockerfileDepsFindings(tmpDir, ["users", "agent"]);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((f) => f.service === "users")).toBe(true);
      expect(results.find((r) => r.serviceName === "agent").skipped).toBe(true);
    });
  });
});
