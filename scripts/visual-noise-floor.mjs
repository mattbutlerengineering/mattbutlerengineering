#!/usr/bin/env node

/**
 * visual-noise-floor.mjs — how many pixels differ between these two PNGs at
 * this sensitivity, for every snapshot x pairing x threshold.
 *
 * The only place outside Playwright that invokes the comparator. It calls
 * `utils.getComparator("image/png")` from the **installed** `playwright-core`
 * with `{ threshold: t, maxDiffPixels: 0 }` and reads the count out of the
 * returned `errorMessage` (`null` means zero). Verified against
 * `playwright-core/lib/coreBundle.js:7521-7568`: `count` is not a returned
 * field, and a zero budget makes the message carry the count for every
 * non-zero result.
 *
 * Using the suite's own installed comparator — rather than adding `pixelmatch`
 * as a dependency — is what makes this a measurement of *this suite* and not
 * of a lookalike. It also keeps `pnpm-lock.yaml` (a turbo `globalDependencies`
 * entry) untouched.
 *
 * Emits the `Measurement` row set of
 * docs/fixes/visual-tolerance-threshold/architecture.md § Data model, plus the
 * merged provenance tuple. Every failure is HARD and names the offending
 * snapshot: a skipped snapshot would lower every max and every percentile,
 * biasing the answer toward *less* sensitivity — the direction of the original
 * defect. Nothing here degrades to a default.
 *
 * Usage:
 *   node scripts/visual-noise-floor.mjs \
 *     --replica-a <dir> --replica-b <dir> --perturbed <dir> --committed <dir> \
 *     [--thresholds 0,0.005,…] [--out measurement.json]
 */

import { readFileSync, readdirSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);

/** The sweep. `t = 0` is load-bearing: the decision rule's clause 0 is
 * evaluated there, so a caller that omits it produces a set the rule rejects
 * rather than one it silently skips a clause on. */
export const DEFAULT_THRESHOLDS = [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2];

/** The three pairings, in § Data model order. */
export const PAIRINGS = ["run", "drift", "signal"];

/** Which two legs each pairing differences, `[actual, expected]`. */
const PAIRING_LEGS = {
  run: ["replicaA", "replicaB"],
  drift: ["replicaA", "committed"],
  signal: ["perturbed", "replicaA"],
};

/** Legs that carry a `provenance.json`. `committed` is the checkout's own
 * `e2e/screenshots/`, which was produced by an older run and has none. */
const PROVENANCE_LEGS = ["replicaA", "replicaB", "perturbed"];

export const PROVENANCE_FILENAME = "provenance.json";

/** The fields a provenance tuple must carry, and must agree on across legs. */
export const PROVENANCE_FIELDS = ["imageOs", "imageVersion", "playwrightVersion", "chromiumBuild"];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** `coreBundle.js:7564` — the count exists only in this free-text message. */
const PIXEL_COUNT_PATTERN = /(\d+) pixels \(ratio [\d.]+ of all image pixels\) are different\./;

/** `coreBundle.js:7536` — a size mismatch carries a pixel count too, so it
 * must never be read as one. Dimensions are validated up front, so reaching
 * this is a bug, not an input problem — hence a throw. */
const SIZE_MISMATCH_PATTERN = /Expected an image \d+px by \d+px, received \d+px by \d+px\./;

/**
 * The installed `playwright-core` package directory.
 *
 * Resolved through `@playwright/test` (a real root devDependency) rather than
 * named directly: `playwright-core` is a transitive dependency, so pnpm's
 * strict layout does not expose it to `scripts/`, and its `exports` map
 * forbids reaching `lib/` by subpath. Resolving `package.json` — the one
 * subpath every package exports — and joining from its directory is the form
 * that survives both, with no pnpm-internal version path hardcoded anywhere.
 *
 * @returns {string} absolute path to the playwright-core package root
 */
export function resolvePlaywrightCoreDir() {
  const testEntry = require_.resolve("@playwright/test");
  const pkg = require_.resolve("playwright-core/package.json", {
    paths: [dirname(testEntry)],
  });
  return dirname(pkg);
}

let comparatorCache = null;

function comparator() {
  if (comparatorCache === null) {
    const { utils } = require_(join(resolvePlaywrightCoreDir(), "lib/coreBundle.js"));
    comparatorCache = utils.getComparator("image/png");
  }
  return comparatorCache;
}

/**
 * `[width, height]` straight off the IHDR chunk — 8 bytes of arithmetic, no
 * decoder and therefore no dependency.
 *
 * @param {Buffer} buffer
 * @param {string} label snapshot name, for the thrown message
 */
export function readPngDimensions(buffer, label) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${label}: not a PNG (bad signature or truncated header)`);
  }
  if (buffer.subarray(12, 16).toString("latin1") !== "IHDR") {
    throw new Error(`${label}: not a PNG (first chunk is not IHDR)`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * The comparator's verdict as a count. `null` means zero differing pixels.
 *
 * Throws — never returns a guess — on a message it cannot read, because the
 * only alternative is a silently-low count, which is the biased direction.
 */
export function extractDiffCount(result, label) {
  if (result === null || result === undefined) return 0;
  const message = String(result.errorMessage ?? "");
  if (SIZE_MISMATCH_PATTERN.test(message)) {
    throw new Error(`${label}: comparator reported a size mismatch: ${message.trim()}`);
  }
  const match = PIXEL_COUNT_PATTERN.exec(message);
  if (!match) {
    throw new Error(`${label}: comparator message carries no pixel count: ${message.trim()}`);
  }
  return Number(match[1]);
}

function readLeg(dir, leg) {
  let entries;
  try {
    if (!statSync(dir).isDirectory()) throw new Error("not a directory");
    entries = readdirSync(dir);
  } catch (error) {
    throw new Error(`${leg}: cannot read directory ${dir} — ${error.message}`);
  }

  const snapshots = new Map();
  for (const entry of entries.filter((e) => e.toLowerCase().endsWith(".png")).sort()) {
    const buffer = readFileSync(join(dir, entry));
    const { width, height } = readPngDimensions(buffer, `${leg}/${entry}`);
    snapshots.set(entry, { buffer, width, height });
  }
  return snapshots;
}

function readProvenance(dir, leg) {
  let raw;
  try {
    raw = readFileSync(join(dir, PROVENANCE_FILENAME), "utf8");
  } catch {
    throw new Error(
      `${leg}: no ${PROVENANCE_FILENAME} — a leg with no provenance cannot be differenced`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${leg}: ${PROVENANCE_FILENAME} is not valid JSON — ${error.message}`);
  }
  return Object.fromEntries(PROVENANCE_FIELDS.map((f) => [f, parsed?.[f] ?? null]));
}

function mergeProvenance(byLeg) {
  const [first, ...rest] = PROVENANCE_LEGS;
  const merged = byLeg[first];
  for (const leg of rest) {
    for (const field of PROVENANCE_FIELDS) {
      if (byLeg[leg][field] !== merged[field]) {
        throw new Error(
          `provenance disagrees between ${first} and ${leg}: ` +
            `${field}=${JSON.stringify(merged[field])} vs ${JSON.stringify(byLeg[leg][field])}. ` +
            `Legs may never be combined across runs.`
        );
      }
    }
  }
  return merged;
}

/**
 * The full measurement set.
 *
 * @param {object} input
 * @param {string} input.replicaA  directory of PNGs (the reference leg)
 * @param {string} input.replicaB  directory of PNGs (a second runner)
 * @param {string} input.perturbed directory of PNGs (the known-regression leg)
 * @param {string} input.committed the checkout's `e2e/screenshots/`
 * @param {number[]} [input.thresholds] sweep points; defaults to DEFAULT_THRESHOLDS
 * @returns {{measurements: Array<object>, provenance: object}}
 */
export function measure({
  replicaA,
  replicaB,
  perturbed,
  committed,
  thresholds = DEFAULT_THRESHOLDS,
}) {
  const dirs = { replicaA, replicaB, perturbed, committed };
  const legs = Object.fromEntries(
    Object.entries(dirs).map(([leg, dir]) => [leg, readLeg(dir, leg)])
  );

  const names = [...legs.replicaA.keys()];
  if (names.length === 0) {
    throw new Error("replicaA contains no snapshots — refusing to emit an empty measurement set");
  }

  // Name-set agreement, both directions, naming the snapshot AND the leg.
  for (const [leg, snapshots] of Object.entries(legs)) {
    for (const name of names) {
      if (!snapshots.has(name)) throw new Error(`${name}: present in replicaA, absent from ${leg}`);
    }
    for (const name of snapshots.keys()) {
      if (!legs.replicaA.has(name)) {
        throw new Error(`${name}: present in ${leg}, absent from replicaA`);
      }
    }
  }

  // Dimension agreement across every leg, before any comparison runs — the
  // comparator would otherwise pad and report a size-mismatch string, which is
  // a different measurement wearing the same units.
  for (const name of names) {
    const { width, height } = legs.replicaA.get(name);
    for (const [leg, snapshots] of Object.entries(legs)) {
      const other = snapshots.get(name);
      if (other.width !== width || other.height !== height) {
        throw new Error(
          `${name}: dimension mismatch — replicaA is ${width}x${height}, ` +
            `${leg} is ${other.width}x${other.height}`
        );
      }
    }
  }

  const provenance = mergeProvenance(
    Object.fromEntries(PROVENANCE_LEGS.map((leg) => [leg, readProvenance(dirs[leg], leg)]))
  );

  const compare = comparator();
  const measurements = [];

  for (const name of names) {
    const { width, height } = legs.replicaA.get(name);
    const area = width * height;

    for (const pairing of PAIRINGS) {
      const [actualLeg, expectedLeg] = PAIRING_LEGS[pairing];
      const actual = legs[actualLeg].get(name).buffer;
      const expected = legs[expectedLeg].get(name).buffer;

      for (const threshold of thresholds) {
        const result = compare(actual, expected, { threshold, maxDiffPixels: 0 });
        const count = extractDiffCount(result, `${name} (${pairing}, threshold ${threshold})`);
        measurements.push({
          snapshot: name,
          width,
          height,
          area,
          pairing,
          threshold,
          count,
          ratio: count / area,
        });
      }
    }
  }

  return { measurements, provenance };
}

function aggregate(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)];
}

/**
 * A markdown summary of the row set — presentation only, no policy.
 *
 * @param {Array<object>} measurements
 * @returns {string}
 */
export function renderMeasurementTable(measurements) {
  const thresholds = [...new Set(measurements.map((m) => m.threshold))].sort((a, b) => a - b);
  const countsAt = (pairing, threshold) =>
    measurements
      .filter((m) => m.pairing === pairing && m.threshold === threshold)
      .map((m) => m.count);

  const lines = [
    "| threshold | run max | drift P90 | drift max | signal min | signal max |",
    "| --------- | ------- | --------- | --------- | ---------- | ---------- |",
  ];
  for (const threshold of thresholds) {
    const run = countsAt("run", threshold);
    const drift = countsAt("drift", threshold);
    const signal = countsAt("signal", threshold);
    lines.push(
      `| ${threshold} | ${Math.max(0, ...run)} | ${aggregate(drift, 90)} | ` +
        `${Math.max(0, ...drift)} | ${signal.length ? Math.min(...signal) : 0} | ` +
        `${Math.max(0, ...signal)} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function main() {
  const args = process.argv.slice(2);
  const required = {
    replicaA: readFlag(args, "--replica-a"),
    replicaB: readFlag(args, "--replica-b"),
    perturbed: readFlag(args, "--perturbed"),
    committed: readFlag(args, "--committed"),
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    console.error(
      `visual-noise-floor.mjs: missing ${missing.join(", ")}\n` +
        "Usage: --replica-a <dir> --replica-b <dir> --perturbed <dir> --committed <dir> " +
        "[--thresholds 0,0.01,…] [--out measurement.json]"
    );
    process.exit(1);
  }

  const sweep = readFlag(args, "--thresholds");
  const { measurements, provenance } = measure({
    ...required,
    ...(sweep ? { thresholds: sweep.split(",").map(Number) } : {}),
  });

  const payload = JSON.stringify({ provenance, measurements }, null, 2);
  const out = readFlag(args, "--out");
  if (out) writeFileSync(out, `${payload}\n`);
  else process.stdout.write(`${payload}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Visual noise floor\n\n` +
        `\`${provenance.imageOs} ${provenance.imageVersion}\` · ` +
        `playwright \`${provenance.playwrightVersion}\` · \`${provenance.chromiumBuild}\`\n\n` +
        `${renderMeasurementTable(measurements)}\n`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
