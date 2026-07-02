import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function writeInfra(root, { wrangler, routesConfig, pulumi }) {
  const worker = path.join(root, "infrastructure", "worker");
  const pulumiDir = path.join(root, "infrastructure", "pulumi");
  fs.mkdirSync(worker, { recursive: true });
  fs.mkdirSync(pulumiDir, { recursive: true });
  fs.writeFileSync(path.join(worker, "wrangler.toml"), wrangler);
  fs.writeFileSync(path.join(worker, "routes-config.json"), JSON.stringify(routesConfig));
  fs.writeFileSync(path.join(pulumiDir, "index.ts"), pulumi);
}

describe("check-service-bindings", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "service-bindings-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("parseWranglerBindings / parseEdgeRouterBindings / parsePulumiBindings", () => {
    test("parse binding names from each of the 3 sources", async () => {
      writeInfra(tmpDir, {
        wrangler: '[[services]]\nbinding = "USERS_API"\nservice = "users-api"\n',
        routesConfig: { staticRoutes: [{ binding: "USERS_API", path: "/api/users" }] },
        pulumi: 'const bindings = [{ name: "USERS_API", service: usersApi }];\n',
      });

      const { parseWranglerBindings, parseEdgeRouterBindings, parsePulumiBindings } =
        await import("../check-service-bindings.js");

      expect(parseWranglerBindings(tmpDir)).toEqual(["USERS_API"]);
      expect(parseEdgeRouterBindings(tmpDir)).toEqual(["USERS_API"]);
      expect(parsePulumiBindings(tmpDir)).toEqual(["USERS_API"]);
    });
  });

  describe("diffBindings", () => {
    test("returns no findings when all 3 sources match", async () => {
      const { diffBindings } = await import("../check-service-bindings.js");
      const findings = diffBindings(["A", "B"], ["A", "B"], ["A", "B"]);

      expect(findings).toHaveLength(0);
    });

    test("reports a finding when wrangler and routes-config disagree", async () => {
      const { diffBindings } = await import("../check-service-bindings.js");
      const findings = diffBindings(["A", "B"], ["A"], ["A"]);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.message.includes("wrangler.toml"))).toBe(true);
    });

    test("reports a finding when routes-config and pulumi disagree", async () => {
      const { diffBindings } = await import("../check-service-bindings.js");
      const findings = diffBindings(["A"], ["A", "B"], ["A"]);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.message.includes("pulumi/index.ts"))).toBe(true);
    });
  });

  describe("findServiceBindingFindings", () => {
    test("aggregates a real fixture end-to-end into no findings when in sync", async () => {
      writeInfra(tmpDir, {
        wrangler: '[[services]]\nbinding = "USERS_API"\nservice = "users-api"\n',
        routesConfig: { staticRoutes: [{ binding: "USERS_API", path: "/api/users" }] },
        pulumi: 'const bindings = [{ name: "USERS_API", service: usersApi }];\n',
      });

      const { findServiceBindingFindings } = await import("../check-service-bindings.js");
      const { findings } = findServiceBindingFindings(tmpDir);

      expect(findings).toHaveLength(0);
    });

    test("aggregates a real fixture end-to-end into findings when mismatched", async () => {
      writeInfra(tmpDir, {
        wrangler: '[[services]]\nbinding = "USERS_API"\nservice = "users-api"\n',
        routesConfig: { staticRoutes: [] },
        pulumi: "const bindings = [];\n",
      });

      const { findServiceBindingFindings } = await import("../check-service-bindings.js");
      const { findings } = findServiceBindingFindings(tmpDir);

      expect(findings.length).toBeGreaterThan(0);
    });
  });
});
