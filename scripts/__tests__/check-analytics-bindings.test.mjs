/**
 * Tests for scripts/check-analytics-bindings.mjs — the drift guard for the
 * edge router's Analytics Engine binding across wrangler.toml, the Pulumi
 * WorkersScript, and infrastructure/worker/analytics-schema.js.
 *
 * The load-bearing case is the anti-vacuous one: a config that parses to zero
 * bindings must be a finding, never a pass. That is the state production sat
 * in for 3.5 months (docs/fixes/rialto-web-usage-instrumentation/defect.md) —
 * wrangler.toml declared the binding, the Pulumi script that deploys carried
 * none, and every existing check read the absence as fine.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANALYTICS_BINDING,
  EDGE_REQUESTS_DATASET,
} from "../../infrastructure/worker/analytics-schema.js";
import {
  parseWranglerAnalytics,
  parsePulumiAnalytics,
  diffAnalyticsBindings,
  findAnalyticsBindingFindings,
} from "../check-analytics-bindings.mjs";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCHEMA = { binding: ANALYTICS_BINDING, dataset: EDGE_REQUESTS_DATASET };
const kinds = (findings) => findings.map((f) => f.kind);

/** The real `[[analytics_engine_datasets]]` table, as wrangler.toml has carried it since bd5dd7083. */
const WRANGLER_ANALYTICS_TABLE = `
# Analytics Engine — custom request metrics (free tier, non-blocking writes)
# Query via SQL API: https://developers.cloudflare.com/analytics/analytics-engine/sql-api/
[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "edge_requests"
`;

const WRANGLER_SERVICES_ONLY = `
[[services]]
binding = "MARKETING"
service = "mattbutlerengineering-marketing"

[[kv_namespaces]]
binding = "HEALTH_STATE"
id = "dda61075cc654b0a849046ae563d8d45"
`;

/** The edge-router bindings array exactly as index.ts:311-318 stood before item 1 — the production defect. */
const PULUMI_PRE_FIX = `
const workerScript = new cloudflare.WorkersScript("mattbutlerengineering-edge-router", {
  accountId: cloudflareAccountId,
  scriptName: "mattbutlerengineering-edge-router",
  content: readFileSync("../worker/dist/edge-router.js", "utf-8"),
  mainModule: "edge-router.js",
  compatibilityDate: "2026-03-25",
  bindings: [
    { name: "API_ORIGIN", text: \`https://api.\${domain}\`, type: "plain_text" },
    { name: "MARKETING", service: "mattbutlerengineering-marketing", type: "service" },
    { name: "HOSPITALITY", service: "mattbutlerengineering-hospitality", type: "service" },
    { name: "RIALTO", service: "mattbutlerengineering-rialto-web", type: "service" },
    { name: "GEN", service: "mattbutlerengineering-gen", type: "service" },
    { name: "HEALTH_STATE", namespaceId: healthKv.id, type: "kv_namespace" },
  ],
});
`;

const PULUMI_REFLOWED = `
  bindings: [
    {
      name: "ANALYTICS",
      dataset: "edge_requests",
      type: "analytics_engine",
    },
  ],
`;

function writeInfra(root, { wrangler, pulumi }) {
  const worker = path.join(root, "infrastructure", "worker");
  const pulumiDir = path.join(root, "infrastructure", "pulumi");
  fs.mkdirSync(worker, { recursive: true });
  fs.mkdirSync(pulumiDir, { recursive: true });
  fs.writeFileSync(path.join(worker, "wrangler.toml"), wrangler);
  fs.writeFileSync(path.join(pulumiDir, "index.ts"), pulumi);
}

describe("check-analytics-bindings", () => {
  describe("parseWranglerAnalytics", () => {
    it("reads binding and dataset from the real wrangler.toml", () => {
      const text = fs.readFileSync(
        path.join(REPO_ROOT, "infrastructure", "worker", "wrangler.toml"),
        "utf-8"
      );
      expect(parseWranglerAnalytics(text)).toEqual([
        { binding: "ANALYTICS", dataset: "edge_requests" },
      ]);
    });

    it("returns [] for a wrangler.toml with only [[services]] and [[kv_namespaces]] tables", () => {
      expect(parseWranglerAnalytics(WRANGLER_SERVICES_ONLY)).toEqual([]);
    });
  });

  describe("parsePulumiAnalytics", () => {
    it("reads exactly one analytics_engine binding from the real index.ts", () => {
      const text = fs.readFileSync(
        path.join(REPO_ROOT, "infrastructure", "pulumi", "index.ts"),
        "utf-8"
      );
      expect(parsePulumiAnalytics(text)).toEqual([{ name: "ANALYTICS", dataset: "edge_requests" }]);
    });

    it("still reads the binding when prettier reflows the literal across lines", () => {
      expect(parsePulumiAnalytics(PULUMI_REFLOWED)).toEqual([
        { name: "ANALYTICS", dataset: "edge_requests" },
      ]);
    });

    it("returns [] for the pre-fix bindings array (no analytics_engine entry)", () => {
      expect(parsePulumiAnalytics(PULUMI_PRE_FIX)).toEqual([]);
    });
  });

  describe("diffAnalyticsBindings", () => {
    const wrangler = [{ binding: "ANALYTICS", dataset: "edge_requests" }];
    const pulumi = [{ name: "ANALYTICS", dataset: "edge_requests" }];

    it("returns [] when all three sources agree", () => {
      expect(diffAnalyticsBindings(wrangler, pulumi, SCHEMA)).toEqual([]);
    });

    it("flags a binding wrangler declares and Pulumi lacks — and the empty Pulumi parse itself", () => {
      const found = kinds(diffAnalyticsBindings(wrangler, [], SCHEMA));
      expect(found).toContain("missing-in-pulumi");
      expect(found).toContain("no-entries:pulumi");
    });

    it("flags the reverse: Pulumi declares it, wrangler parses to nothing", () => {
      const found = kinds(diffAnalyticsBindings([], pulumi, SCHEMA));
      expect(found).toContain("missing-in-wrangler");
      expect(found).toContain("no-entries:wrangler");
    });

    it("flags the same binding pointing at different datasets", () => {
      const found = kinds(
        diffAnalyticsBindings(
          wrangler,
          [{ name: "ANALYTICS", dataset: "edge_requests_v2" }],
          SCHEMA
        )
      );
      expect(found).toContain("dataset-mismatch");
    });

    it("flags schema constants that name a different dataset than the configs", () => {
      const found = kinds(
        diffAnalyticsBindings(wrangler, pulumi, { binding: "ANALYTICS", dataset: "requests" })
      );
      expect(found).toContain("dataset-mismatch");
    });

    it("flags a binding the schema module does not know", () => {
      const found = kinds(
        diffAnalyticsBindings(wrangler, pulumi, { binding: "METRICS", dataset: "edge_requests" })
      );
      expect(found).toContain("missing-in-schema");
    });

    it("never passes when both configs parse to nothing (anti-vacuous rule)", () => {
      const findings = diffAnalyticsBindings([], [], SCHEMA);
      expect(findings).not.toEqual([]);
      expect(kinds(findings)).toEqual(
        expect.arrayContaining(["no-entries:wrangler", "no-entries:pulumi"])
      );
    });
  });

  describe("findAnalyticsBindingFindings", () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-bindings-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("passes on the real repo tree with non-empty wrangler and Pulumi sources", () => {
      const result = findAnalyticsBindingFindings(REPO_ROOT);
      expect(result.wrangler.length).toBeGreaterThanOrEqual(1);
      expect(result.pulumi.length).toBeGreaterThanOrEqual(1);
      expect(result.schema).toEqual(SCHEMA);
      expect(result.findings).toEqual([]);
    });

    it("would have failed on the tree as it stood before this run (missing-in-pulumi)", () => {
      writeInfra(tmpDir, { wrangler: WRANGLER_ANALYTICS_TABLE, pulumi: PULUMI_PRE_FIX });
      const { findings } = findAnalyticsBindingFindings(tmpDir);
      expect(kinds(findings)).toContain("missing-in-pulumi");
      expect(kinds(findings)).toContain("no-entries:pulumi");
    });
  });
});
