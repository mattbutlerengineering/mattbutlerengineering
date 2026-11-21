/**
 * Tests for scripts/check-rate-limit-bindings.mjs — the drift guard for the
 * edge router's Workers Rate Limiting bindings across wrangler.toml, the
 * Pulumi WorkersScript and infrastructure/worker/rate-limiter.js (#9209).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCHEMA_SOURCE,
  parseWranglerRateLimits,
  parsePulumiRateLimits,
  diffRateLimitBindings,
  findRateLimitBindingFindings,
} from "../check-rate-limit-bindings.mjs";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), "utf-8");
const kinds = (findings) => findings.map((f) => f.kind);
const entry = { name: "RATE_LIMIT_API", namespaceId: "1003", limit: 100, period: 60 };

describe("check-rate-limit-bindings", () => {
  it("passes on the real repo and covers every RATE_LIMITS rule in both configs", () => {
    const { wrangler, pulumi, schema, findings } = findRateLimitBindingFindings();
    expect(findings).toEqual([]);
    expect(wrangler).toHaveLength(schema.length);
    expect(pulumi).toHaveLength(schema.length);
    expect(schema.length).toBeGreaterThan(0);
  });

  it("parses wrangler [[ratelimits]] tables", () => {
    const text = `[[ratelimits]]\nname = "RATE_LIMIT_API"\nnamespace_id = "1003"\nsimple = { limit = 100, period = 60 }\n`;
    expect(parseWranglerRateLimits(text)).toEqual([entry]);
    expect(parseWranglerRateLimits(read("infrastructure", "worker", "wrangler.toml"))).toEqual(
      SCHEMA_SOURCE
    );
  });

  it("parses Pulumi literals, including a prettier reflow", () => {
    const text = `{
      name: "RATE_LIMIT_API",
      namespaceId: "1003",
      type: "ratelimit",
      simple: { limit: 100, period: 60 },
    }`;
    expect(parsePulumiRateLimits(text)).toEqual([entry]);
    expect(parsePulumiRateLimits(read("infrastructure", "pulumi", "index.ts"))).toEqual(
      SCHEMA_SOURCE
    );
  });

  it("returns [] for configs with no rate limit bindings and flags both as vacuous", () => {
    expect(parseWranglerRateLimits("[[services]]\n")).toEqual([]);
    expect(parsePulumiRateLimits("bindings: []")).toEqual([]);
    expect(kinds(diffRateLimitBindings([], [], [entry]))).toEqual(
      expect.arrayContaining(["no-entries:wrangler", "no-entries:pulumi"])
    );
  });

  it("flags a binding missing from a source", () => {
    expect(kinds(diffRateLimitBindings([entry], [], [entry]))).toContain("missing-in-pulumi");
    expect(kinds(diffRateLimitBindings([entry], [entry], []))).toContain("missing-in-schema");
  });

  it("flags a limit, period or namespace mismatch", () => {
    for (const changed of [{ limit: 50 }, { period: 10 }, { namespaceId: "9" }]) {
      const found = diffRateLimitBindings([entry], [{ ...entry, ...changed }], [entry]);
      expect(kinds(found)).toContain("config-mismatch");
    }
  });

  it("flags an unsupported period and a non-integer namespace id", () => {
    const bad = { ...entry, period: 30 };
    expect(kinds(diffRateLimitBindings([bad], [bad], [bad]))).toContain("invalid-config");
    const badId = { ...entry, namespaceId: "0" };
    expect(kinds(diffRateLimitBindings([badId], [badId], [badId]))).toContain("invalid-config");
  });

  it("flags two rules sharing a namespace id", () => {
    const all = [entry, { ...entry, name: "RATE_LIMIT_PUBLIC" }];
    expect(kinds(diffRateLimitBindings(all, all, all))).toContain("duplicate-namespace-id");
  });
});
