/**
 * Stable drift signature for `nightly-compliance.yml` (#5084).
 *
 * The workflow used to key its filed issue on `date` alone
 * (`nightly-compliance-drift-${today}`), so a persistent failure filed a
 * fresh issue every single night instead of being recognised as the same
 * bug — five of seven nights in the 2026-08-31 → 2026-09-06 window reported
 * the identical `packages/rialto#test` timeout as five separate issues.
 *
 * `computeDriftSignature()` derives a stable identifier from the *failure
 * content* of a report.md (the `- ✗ ...` marker lines the workflow already
 * emits, plus the first line of each marker's following fenced detail
 * block, with volatile tokens like dates/durations/hashes stripped) — never
 * from the date. Same underlying failure, same signature, every night;
 * a genuinely different failure gets a different one.
 */

import { createHash } from "node:crypto";

const FAILURE_MARKER_RE = /^\s*-\s*✗\s*(.+)$/;
const NEXT_MARKER_RE = /^\s*-\s*[✗✓]/;
const FENCE = "```";

const VOLATILE_PATTERNS = [
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "<timestamp>"],
  [/\d{4}-\d{2}-\d{2}/g, "<date>"],
  [/\b\d{2}:\d{2}:\d{2}(\.\d+)?\b/g, "<time>"],
  [/\b\d+(\.\d+)?\s?(ms|s|sec|secs|m|min|mins)\b/gi, "<duration>"],
  [/\bhttps?:\/\/\S+/g, "<url>"],
  [/\b[0-9a-f]{7,40}\b/gi, "<hash>"],
  [/\d+/g, "<n>"],
];

/**
 * Replaces volatile substrings (dates, timestamps, durations, run URLs,
 * hex ids, and any remaining raw numbers) with fixed placeholders so the
 * same underlying failure normalizes identically across nights.
 *
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return VOLATILE_PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text
  ).trim();
}

/**
 * Parses a nightly-compliance report.md into its failing-check entries:
 * each `- ✗ \`<name>\` ...` marker line, paired with the first non-blank
 * line of the fenced code block that immediately follows it (if any,
 * before the next `- ✗`/`- ✓` marker). Pure — reads nothing but the string
 * it's given.
 *
 * @param {string} report
 * @returns {Array<{ name: string, detail: string }>}
 */
export function extractFailingChecks(report) {
  const lines = report.split("\n");
  const checks = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(FAILURE_MARKER_RE);
    if (!match) continue;

    const name = match[1].trim();
    let detail = "";

    for (let j = i + 1; j < lines.length; j += 1) {
      if (NEXT_MARKER_RE.test(lines[j])) break;
      if (lines[j].trim() !== FENCE) continue;

      for (let k = j + 1; k < lines.length; k += 1) {
        if (lines[k].trim() === FENCE) break;
        if (lines[k].trim() !== "") {
          detail = lines[k].trim();
          break;
        }
      }
      break;
    }

    checks.push({ name, detail });
  }

  return checks;
}

/**
 * Computes a stable drift signature from a nightly-compliance report.md.
 * Pure and deterministic: the same report content always yields the same
 * signature, in this process or any other, and the date is never an input.
 *
 * @param {string} report
 * @returns {string} a short hex signature
 */
export function computeDriftSignature(report) {
  const checks = extractFailingChecks(report);
  const normalized = checks
    .map(({ name, detail }) => `${normalize(name)} :: ${normalize(detail)}`)
    .sort();

  return createHash("sha256").update(normalized.join("\n")).digest("hex").slice(0, 16);
}
