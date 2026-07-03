import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function writeBaseline(root, service) {
  const dir = path.join(root, "services", service, "src", "schemas");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "schema-baseline.json"), "{}");
}

describe("check-schema-compat", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-compat-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("findSchemaBaselineFindings", () => {
    test("reports every service present when all baselines exist", async () => {
      writeBaseline(tmpDir, "users");
      writeBaseline(tmpDir, "reservations");

      const { findSchemaBaselineFindings } = await import("../check-schema-compat.js");
      const results = findSchemaBaselineFindings(tmpDir, ["users", "reservations"]);

      expect(results).toEqual([
        { service: "users", exists: true },
        { service: "reservations", exists: true },
      ]);
    });

    test("reports a missing baseline for a service without one", async () => {
      writeBaseline(tmpDir, "users");

      const { findSchemaBaselineFindings } = await import("../check-schema-compat.js");
      const results = findSchemaBaselineFindings(tmpDir, ["users", "reservations"]);

      expect(results).toEqual([
        { service: "users", exists: true },
        { service: "reservations", exists: false },
      ]);
    });
  });
});
