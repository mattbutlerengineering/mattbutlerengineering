#!/usr/bin/env node

/**
 * visual-diff-report.mjs — turn one Playwright JSON report into the list of
 * snapshots that actually changed, and read the pixel budget out of the
 * Playwright config that same report names.
 *
 * Both functions are facts about **Playwright's** formats, which is why the
 * budget parse lives here and not in `visual-diff-comment.mjs`: the comment
 * module is the one that must not learn any.
 *
 * Pure and in-process — no filesystem, no child processes, no GitHub client.
 * Inputs are an already-parsed object and a string; the thin caller
 * (`scripts/publish-visual-diffs.mjs`) owns every read.
 *
 * Verified against Playwright 1.62.1. See
 * `scripts/__tests__/visual-diff-report.test.mjs` and its fixtures.
 */

/** ANSI SGR escapes. The JSON reporter formats through `nonTerminalScreen`,
 * whose colors are inherited from the terminal screen and are therefore
 * environment-dependent — a real message arrives escape-wrapped. */
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/**
 * The pixel count exists in exactly ONE place: the free-text matcher message
 * built in `playwright-core/lib/coreBundle.js:7564`. It is not exposed
 * structurally anywhere — not in `attachments[]`, not in the PNG filenames,
 * not in the matcher result.
 */
const PIXEL_COUNT_PATTERN = /(\d+) pixels \(ratio [\d.]+ of all image pixels\) are different\./;

/** `coreBundle.js:7536` — a size mismatch also carries a pixel count, so this
 * must be tested before falling through to `pixel-diff`. */
const SIZE_MISMATCH_PATTERN = /Expected an image \d+px by \d+px, received \d+px by \d+px\./;

/** `expect.js:12481` (`handleMissing`). */
const MISSING_BASELINE_PATTERN = /A snapshot doesn't exist at /;

/** Attachment base name -> snapshot name, e.g. `light-dialog-open-actual.png`. */
const ACTUAL_ATTACHMENT_PATTERN = /^(.*)-actual(\.[^.]+)$/;

/** Pure: every spec in the report, walking nested suites. */
function collectSpecs(node, acc = []) {
  if (!node || typeof node !== "object") return acc;
  for (const spec of node.specs ?? []) acc.push(spec);
  for (const child of node.suites ?? []) collectSpecs(child, acc);
  return acc;
}

/**
 * Pure: the entry a failing spec should be judged on.
 *
 * The config sets `retries: 1` in CI, so a spec has up to two entries in
 * `results[]`. Only the highest `retry` is the run's verdict — reading
 * `results[0]` would report a count the retry already disproved.
 */
function highestRetryResult(results) {
  let best = null;
  for (const result of results ?? []) {
    if (best === null || (result?.retry ?? 0) >= (best.retry ?? 0)) best = result;
  }
  return best;
}

function stripAnsi(text) {
  return typeof text === "string" ? text.replace(ANSI_PATTERN, "") : "";
}

function messageOf(result) {
  return (result?.errors ?? []).map((err) => stripAnsi(err?.message)).join("\n");
}

/** Pure: `pixel-diff` | `size-mismatch` | `missing-baseline`. */
function classifyReason(message) {
  if (MISSING_BASELINE_PATTERN.test(message)) return "missing-baseline";
  if (SIZE_MISMATCH_PATTERN.test(message)) return "size-mismatch";
  return "pixel-diff";
}

/**
 * Pure: the count, or `null`.
 *
 * `null` — never a thrown error and never a guessed number — is the contract
 * for an unparsable message. The comment renders the reason instead.
 */
function extractPixels(message) {
  const match = PIXEL_COUNT_PATTERN.exec(message);
  return match ? Number(match[1]) : null;
}

/**
 * Pure: one result entry -> a parsed snapshot record, or `null` when this
 * failure was not a snapshot diff at all (a webServer timeout, a suite-level
 * error) and therefore has nothing to show.
 *
 * @returns {{name:string, pixels:number|null, reason:string,
 *            expectedPath:string|null, actualPath:string, diffPath:string|null} | null}
 */
function buildRecord(result) {
  const attachments = result?.attachments ?? [];
  const actual = attachments.find((a) => ACTUAL_ATTACHMENT_PATTERN.test(a?.name ?? ""));
  if (!actual?.path) return null;

  const [, name, extension] = ACTUAL_ATTACHMENT_PATTERN.exec(actual.name);
  const message = messageOf(result);
  const reason = classifyReason(message);

  const diff = attachments.find((a) => a?.name === `${name}-diff${extension}`);

  // The `-expected` attachment's own `path` points at the COMMITTED baseline
  // (`e2e/screenshots/…`, `expect.js:12504`), which is not inside the uploaded
  // artifact. The identical bytes are written next to the actual as
  // `<base>-expected.png` (`legacyExpectedPath`, `expect.js:12415`) — but only
  // on the comparison path. A missing baseline has no expected image at all.
  const expectedPath =
    reason === "missing-baseline"
      ? null
      : actual.path.replace(new RegExp(`-actual\\${extension}$`), `-expected${extension}`);

  return {
    name,
    pixels: extractPixels(message),
    reason,
    expectedPath,
    actualPath: actual.path,
    diffPath: diff?.path ?? null,
  };
}

/**
 * Pure: one Playwright JSON report -> `{ total, changed[] }`.
 *
 * `total` is the report's own spec count, never a literal, so SC-2's
 * denominator cannot go stale when the suite grows.
 *
 * @param {object} report The object written by Playwright's built-in `json` reporter.
 * @returns {{total:number, changed:Array<object>}}
 */
export function parseVisualReport(report) {
  const specs = collectSpecs(report);
  const changed = [];

  for (const spec of specs) {
    // A spec that failed then passed is a flake, not a regression: Playwright
    // reports `ok: true` for it, and it must not appear.
    if (spec?.ok !== false) continue;
    for (const test of spec.tests ?? []) {
      const record = buildRecord(highestRetryResult(test?.results));
      if (record) changed.push(record);
    }
  }

  return { total: specs.length, changed };
}

// ---------------------------------------------------------------------------
// parseMaxDiffPixels — the suite-wide budget, read from the config's TEXT
// ---------------------------------------------------------------------------

/**
 * Pure: strip `//` and block comments while respecting string and template
 * literals, so a `baseURL: "http://…"` cannot swallow the rest of its line.
 *
 * Regex literals are deliberately not tracked: a `/` inside one could be read
 * as a comment start, which degrades the answer to `null` (say less) rather
 * than producing a wrong number.
 */
function stripComments(source) {
  let out = "";
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++;
      out += " ";
      continue;
    }

    out += ch;
  }
  return out;
}

const MAX_DIFF_PIXELS_PATTERN = /\bmaxDiffPixels\s*:\s*(\d[\d_]*)/g;
const MAX_DIFF_PIXEL_RATIO_PATTERN = /\bmaxDiffPixelRatio\s*:/g;
const ANY_MAX_DIFF_PIXELS_KEY_PATTERN = /\bmaxDiffPixels\s*:/g;

/**
 * Pure: the suite-wide `expect.toHaveScreenshot.maxDiffPixels`, or `null`.
 *
 * Text, not `import()`: the publisher job deliberately runs no `pnpm install`
 * — that absence is what keeps the pull request's dependency tree from
 * executing under a `contents: write` token — so `defineConfig` from
 * `@playwright/test` is unresolvable and importing the config would throw.
 *
 * Returns `null` — **never** a fallback number — when the answer is not a
 * single unambiguous value:
 *   - no `maxDiffPixels` at all;
 *   - more than one (a project override makes it per-project);
 *   - a LIVE `maxDiffPixelRatio` alongside it, because the enforced budget is
 *     then `min(maxDiffPixels, w × h × ratio)` (`coreBundle.js:7556-7562`),
 *     which is per-image and not a single number a comment could name.
 *
 * `renderComment` degrades to `### name (N px changed)` on `null`. A comment
 * that confidently asserts a budget it did not read would reproduce #4496 —
 * the tolerance change nobody noticed — inside the fix for it.
 *
 * @param {unknown} configSource The config file's text.
 * @returns {number|null}
 */
export function parseMaxDiffPixels(configSource) {
  if (typeof configSource !== "string" || configSource === "") return null;

  const source = stripComments(configSource);

  if (source.match(MAX_DIFF_PIXEL_RATIO_PATTERN)) return null;

  const keys = source.match(ANY_MAX_DIFF_PIXELS_KEY_PATTERN) ?? [];
  if (keys.length !== 1) return null;

  const values = [...source.matchAll(MAX_DIFF_PIXELS_PATTERN)];
  if (values.length !== 1) return null;

  return Number(values[0][1].replace(/_/g, ""));
}
