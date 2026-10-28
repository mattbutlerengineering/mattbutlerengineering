#!/usr/bin/env node
/**
 * Appends one summary row to a committed metrics file (#7581).
 *
 *   node scripts/record-summary-row.mjs lighthouse <dir-with-lhr-json> [--commit sha]
 *   node scripts/record-summary-row.mjs mutation <path-to-mutation.json> [--commit sha]
 *
 * Writes nothing and exits 1 when the run measured nothing, so the workflow
 * step goes red and no hollow row can pass for a measurement.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLighthouseRow, buildMutationRow } from "./metrics-summary-rows.mjs";
import { append } from "./metrics-store.mjs";

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, input] = process.argv.slice(2);
  const ci = process.argv.indexOf("--commit");
  const meta = {
    date: new Date().toISOString().slice(0, 10),
    commit: ci > -1 ? process.argv[ci + 1] : (process.env.GITHUB_SHA ?? "unknown"),
  };

  let row = null;
  let metric = null;
  if (kind === "lighthouse") {
    const lhrs = readdirSync(input)
      .filter((f) => /^lhr-.*\.json$/.test(f))
      .map((f) => readJson(join(input, f)))
      .filter(Boolean);
    row = buildLighthouseRow(lhrs, meta);
    metric = "lighthouse";
  } else if (kind === "mutation") {
    row = buildMutationRow(readJson(input), meta);
    metric = "mutation-score";
  } else {
    console.error("usage: record-summary-row.mjs <lighthouse|mutation> <input> [--commit sha]");
    process.exit(2);
  }

  if (!row) {
    console.error(`${kind}: the run produced no measurement; no row written.`);
    process.exit(1);
  }
  append(metric, row);
  console.log(`${metric}: appended row for ${meta.date}`);
}
