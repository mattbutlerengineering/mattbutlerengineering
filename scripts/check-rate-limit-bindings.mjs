#!/usr/bin/env node

/**
 * Architecture fitness test: the edge router's Workers Rate Limiting bindings
 * must be declared identically in the three places that name them:
 *
 * 1. infrastructure/worker/wrangler.toml      — [[ratelimits]] name / namespace_id / simple
 * 2. infrastructure/pulumi/index.ts           — { name, namespaceId, type: "ratelimit", simple }
 * 3. infrastructure/worker/rate-limiter.js    — RATE_LIMITS (binding, namespaceId, maxRequests, windowSeconds)
 *
 * Limit and period are fixed per binding, so a drift between the table the
 * Worker reads and the binding that is deployed means the enforced limit
 * silently differs from the one the code reports. Mirrors
 * check-analytics-bindings.mjs, including its anti-vacuous rule: a config that
 * parses to ZERO rate-limit bindings is a finding, never a pass.
 *
 * Also enforces Cloudflare's constraints: period is 10 or 60, namespaceId is a
 * positive-integer string, and namespaceIds are unique.
 *
 * Usage: node scripts/check-rate-limit-bindings.mjs
 * Exit code: 0 if all three sources agree and both configs are non-empty, 1 otherwise
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";
import { RATE_LIMITS } from "../infrastructure/worker/rate-limiter.js";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_LABELS = Object.freeze({
  wrangler: "infrastructure/worker/wrangler.toml",
  pulumi: "infrastructure/pulumi/index.ts",
  schema: "infrastructure/worker/rate-limiter.js",
});

const VALID_PERIODS = Object.freeze([10, 60]);

/** S3: RATE_LIMITS normalised to { name, namespaceId, limit, period }. */
export const SCHEMA_SOURCE = RATE_LIMITS.map((r) => ({
  name: r.binding,
  namespaceId: r.namespaceId,
  limit: r.maxRequests,
  period: r.windowSeconds,
}));

const toEntries = (text, pattern) =>
  [...text.matchAll(pattern)].map((m) => ({
    name: m[1],
    namespaceId: m[2],
    limit: Number(m[3]),
    period: Number(m[4]),
  }));

/** S1: `[[ratelimits]]` tables → [{ name, namespaceId, limit, period }]. */
export function parseWranglerRateLimits(text) {
  return toEntries(
    text,
    /\[\[ratelimits\]\]\s*\nname\s*=\s*"(\w+)"\s*\nnamespace_id\s*=\s*"(\d+)"\s*\nsimple\s*=\s*\{\s*limit\s*=\s*(\d+)\s*,\s*period\s*=\s*(\d+)\s*\}/g
  );
}

/** S2: `{ name, namespaceId, type: "ratelimit", simple: { limit, period } }` literals. */
export function parsePulumiRateLimits(text) {
  return toEntries(
    text,
    /\{\s*name:\s*"(\w+)",\s*namespaceId:\s*"(\d+)",\s*type:\s*"ratelimit",\s*simple:\s*\{\s*limit:\s*(\d+),\s*period:\s*(\d+),?\s*\},?\s*\}/g
  );
}

const describeEntry = (e) => `namespaceId=${e.namespaceId} limit=${e.limit} period=${e.period}`;

/** Pure comparison of the three sources — returns `{ kind, message }` findings, never logs. */
export function diffRateLimitBindings(wrangler, pulumi, schema) {
  const emptiness = [
    ["wrangler", wrangler.length, "no [[ratelimits]] table"],
    ["pulumi", pulumi.length, 'no { type: "ratelimit" } binding'],
  ]
    .filter(([, count]) => count === 0)
    .map(([source, , what]) => ({
      kind: `no-entries:${source}`,
      message: `${SOURCE_LABELS[source]} parsed to ${what} — a parser that matches nothing is a failure, not a pass`,
    }));

  const bySource = {
    wrangler: new Map(wrangler.map((e) => [e.name, e])),
    pulumi: new Map(pulumi.map((e) => [e.name, e])),
    schema: new Map(schema.map((e) => [e.name, e])),
  };
  const names = [...new Set(Object.values(bySource).flatMap((m) => [...m.keys()]))].sort();

  const perBinding = names.flatMap((name) => {
    const missing = Object.entries(bySource)
      .filter(([, m]) => !m.has(name))
      .map(([source]) => ({
        kind: `missing-in-${source}`,
        message: `Binding "${name}" is not declared in ${SOURCE_LABELS[source]}`,
      }));
    const present = Object.entries(bySource).filter(([, m]) => m.has(name));
    const distinct = new Set(present.map(([, m]) => describeEntry(m.get(name))));
    const mismatch =
      distinct.size > 1
        ? [
            {
              kind: "config-mismatch",
              message: `Binding "${name}" differs: ${present
                .map(([source, m]) => `${source}(${describeEntry(m.get(name))})`)
                .join(", ")}`,
            },
          ]
        : [];
    return [...missing, ...mismatch];
  });

  const invalid = [...wrangler, ...pulumi, ...schema]
    .filter((e) => !VALID_PERIODS.includes(e.period) || !/^[1-9]\d*$/.test(e.namespaceId))
    .map((e) => ({
      kind: "invalid-config",
      message: `Binding "${e.name}" needs period 10 or 60 and a positive-integer namespaceId (${describeEntry(e)})`,
    }));

  const owners = new Map();
  for (const e of schema) {
    owners.set(e.namespaceId, [...(owners.get(e.namespaceId) ?? []), e.name]);
  }
  const duplicates = [...owners.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([id, names]) => ({
      kind: "duplicate-namespace-id",
      message: `namespaceId ${id} is shared by ${names.join(", ")} — each limiter needs its own`,
    }));

  return [...emptiness, ...perBinding, ...invalid, ...duplicates];
}

/** Pure end-to-end aggregation — `root` governs only the two config reads; S3 is the imported module. */
export function findRateLimitBindingFindings(root = DEFAULT_ROOT) {
  const wrangler = parseWranglerRateLimits(
    readFileSync(join(root, "infrastructure", "worker", "wrangler.toml"), "utf-8")
  );
  const pulumi = parsePulumiRateLimits(
    readFileSync(join(root, "infrastructure", "pulumi", "index.ts"), "utf-8")
  );
  const schema = SCHEMA_SOURCE;
  return { wrangler, pulumi, schema, findings: diffRateLimitBindings(wrangler, pulumi, schema) };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-rate-limit-bindings.mjs");

if (isMain) {
  const { wrangler, pulumi, schema, findings } = findRateLimitBindingFindings();
  const show = (entries) => entries.map((e) => e.name).join(", ") || "(none)";
  const preamble =
    "Checking rate limit binding consistency across 3 sources...\n\n" +
    `  ${SOURCE_LABELS.wrangler}:  [${show(wrangler)}]\n` +
    `  ${SOURCE_LABELS.pulumi}:  [${show(pulumi)}]\n` +
    `  ${SOURCE_LABELS.schema}:  [${show(schema)}]\n\n`;

  process.exit(
    runCheck({
      name: "rate limit binding consistency",
      findings,
      formatFinding: (f) => `[${f.kind}] ${f.message}`,
      passMessage:
        preamble +
        `PASS: wrangler.toml, pulumi/index.ts and rate-limiter.js agree on the rate limit bindings (${show(schema)}).`,
      failMessage:
        preamble +
        "FAIL: rate limit binding drift detected — the Pulumi WorkersScript is what\n" +
        "deploys; wrangler.toml and rate-limiter.js must match it:\n",
    })
  );
}
