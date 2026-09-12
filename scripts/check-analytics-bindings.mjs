#!/usr/bin/env node

/**
 * Architecture fitness test: the edge router's Analytics Engine binding must
 * be declared identically in the three places that name it:
 *
 * 1. infrastructure/worker/wrangler.toml       — [[analytics_engine_datasets]] binding / dataset
 * 2. infrastructure/pulumi/index.ts            — { name, dataset, type: "analytics_engine" }
 * 3. infrastructure/worker/analytics-schema.js — ANALYTICS_BINDING / EDGE_REQUESTS_DATASET
 *
 * A sibling of check-service-bindings.js, not an extension: this compares
 * datasets as well as names, and reads the schema module as a third source.
 *
 * Anti-vacuous rule: a config that parses to ZERO analytics bindings is a
 * finding (`no-entries:<source>`), never a pass. That was production's exact
 * state for 3.5 months (docs/fixes/rialto-web-usage-instrumentation) —
 * wrangler.toml declared the binding, the Pulumi WorkersScript that actually
 * deploys carried none, and nothing read the absence as wrong.
 *
 * Usage: node scripts/check-analytics-bindings.mjs
 * Exit code: 0 if all three sources agree and both configs are non-empty, 1 otherwise
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";
import {
  ANALYTICS_BINDING,
  EDGE_REQUESTS_DATASET,
} from "../infrastructure/worker/analytics-schema.js";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_LABELS = Object.freeze({
  wrangler: "infrastructure/worker/wrangler.toml",
  pulumi: "infrastructure/pulumi/index.ts",
  schema: "infrastructure/worker/analytics-schema.js",
});

/** S3: the constants the writer and reader import. */
export const SCHEMA_SOURCE = Object.freeze({
  binding: ANALYTICS_BINDING,
  dataset: EDGE_REQUESTS_DATASET,
});

/** S1: `[[analytics_engine_datasets]]` tables → [{ binding, dataset }]. Header-anchored, like parseWranglerBindings. */
export function parseWranglerAnalytics(text) {
  const pattern =
    /\[\[analytics_engine_datasets\]\]\s*\nbinding\s*=\s*"(\w+)"\s*\ndataset\s*=\s*"(\w+)"/g;
  const entries = [];
  let found;
  while ((found = pattern.exec(text)) !== null) {
    entries.push({ binding: found[1], dataset: found[2] });
  }
  return entries;
}

/**
 * S2: `{ name, dataset, type: "analytics_engine" }` literals → [{ name, dataset }].
 * `\s*` throughout and an optional trailing comma so a prettier reflow
 * (trailingComma: "es5") is harmless; order-dependent, matching the sibling.
 */
export function parsePulumiAnalytics(text) {
  const pattern =
    /\{\s*name:\s*"(\w+)",\s*dataset:\s*"(\w+)",\s*type:\s*"analytics_engine",?\s*\}/g;
  const entries = [];
  let found;
  while ((found = pattern.exec(text)) !== null) {
    entries.push({ name: found[1], dataset: found[2] });
  }
  return entries;
}

/**
 * Pure comparison of the three sources — returns findings, never logs.
 * Each finding is `{ kind, message }`; kinds: missing-in-wrangler,
 * missing-in-pulumi, missing-in-schema, dataset-mismatch, no-entries:wrangler,
 * no-entries:pulumi.
 */
export function diffAnalyticsBindings(wrangler, pulumi, schema) {
  const emptiness = [
    ["wrangler", wrangler.length, "no [[analytics_engine_datasets]] table"],
    ["pulumi", pulumi.length, 'no { type: "analytics_engine" } binding'],
  ]
    .filter(([, count]) => count === 0)
    .map(([source, , what]) => ({
      kind: `no-entries:${source}`,
      message: `${SOURCE_LABELS[source]} parsed to ${what} — a parser that matches nothing is a failure, not a pass`,
    }));

  const bySource = {
    wrangler: new Map(wrangler.map((e) => [e.binding, e.dataset])),
    pulumi: new Map(pulumi.map((e) => [e.name, e.dataset])),
    schema: new Map([[schema.binding, schema.dataset]]),
  };
  const names = [...new Set(Object.values(bySource).flatMap((m) => [...m.keys()]))].sort();

  const perBinding = names.flatMap((name) => {
    const missing = Object.entries(bySource)
      .filter(([, m]) => !m.has(name))
      .map(([source]) => ({
        kind: `missing-in-${source}`,
        message: `Binding "${name}" is not declared in ${SOURCE_LABELS[source]}`,
      }));
    const datasets = Object.entries(bySource)
      .filter(([, m]) => m.has(name))
      .map(([source, m]) => `${source}=${m.get(name)}`);
    const distinct = new Set(datasets.map((d) => d.split("=")[1]));
    const mismatch =
      distinct.size > 1
        ? [
            {
              kind: "dataset-mismatch",
              message: `Binding "${name}" names different datasets: ${datasets.join(", ")}`,
            },
          ]
        : [];
    return [...missing, ...mismatch];
  });

  return [...emptiness, ...perBinding];
}

/** Pure end-to-end aggregation — `root` governs only the two config reads; S3 is the imported module. */
export function findAnalyticsBindingFindings(root = DEFAULT_ROOT) {
  const wrangler = parseWranglerAnalytics(
    readFileSync(join(root, "infrastructure", "worker", "wrangler.toml"), "utf-8")
  );
  const pulumi = parsePulumiAnalytics(
    readFileSync(join(root, "infrastructure", "pulumi", "index.ts"), "utf-8")
  );
  const schema = SCHEMA_SOURCE;
  const findings = diffAnalyticsBindings(wrangler, pulumi, schema);
  return { wrangler, pulumi, schema, findings };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-analytics-bindings.mjs");

if (isMain) {
  const { wrangler, pulumi, schema, findings } = findAnalyticsBindingFindings();
  const show = (entries) =>
    entries.map((e) => `${e.binding ?? e.name} → ${e.dataset}`).join(", ") || "(none)";

  // The three-source preamble is prepended to whichever message runCheck
  // prints rather than logged here: runCheck already owns this script's entire
  // stdout, and its plain-string pass/failMessage take a multi-line value. The
  // two checks written after it (check-ci-gate-coverage.mjs,
  // check-orphaned-tests.mjs) print nothing of their own for the same reason.
  const preamble =
    "Checking Analytics Engine binding consistency across 3 sources...\n\n" +
    `  ${SOURCE_LABELS.wrangler}:        [${show(wrangler)}]\n` +
    `  ${SOURCE_LABELS.pulumi}:             [${show(pulumi)}]\n` +
    `  ${SOURCE_LABELS.schema}:  [${show([schema])}]\n\n`;

  // The remediation hint moves INTO failMessage (above the findings) rather
  // than after them — runCheck has no post-findings hook, and guidance-then-
  // findings is the order check-ci-gate-coverage.mjs already uses. The PASS
  // path, which is the one repo-audit runs, is byte-for-byte unchanged.
  process.exit(
    runCheck({
      name: "analytics binding consistency",
      findings,
      formatFinding: (f) => `[${f.kind}] ${f.message}`,
      passMessage:
        preamble +
        `PASS: wrangler.toml, pulumi/index.ts and analytics-schema.js agree on the Analytics Engine binding (${schema.binding} → ${schema.dataset}).`,
      failMessage:
        preamble +
        "FAIL: Analytics Engine binding drift detected — the Pulumi WorkersScript is what\n" +
        "deploys; wrangler.toml and analytics-schema.js must match it:\n",
    })
  );
}
