#!/usr/bin/env node

/**
 * visual-tolerance.mjs — facts read out of a Playwright config's TEXT.
 *
 * Owns comment stripping (string- and template-aware) and the extraction of
 * the three tolerance directives — `threshold`, `maxDiffPixelRatio`,
 * `maxDiffPixels` — with their occurrence counts. It is the ONE place that
 * answers "what does this config's text say about tolerance"; both callers
 * express a different *policy* over the same lexical answer:
 *
 *   - `parseMaxDiffPixels` (scripts/visual-diff-report.mjs) — the PR comment's
 *     budget, `null` on any ambiguity;
 *   - `scripts/__tests__/visual-tolerance-guard.test.mjs` — the drift guard.
 *
 * Two copies of "how do you strip a comment from this file" is the shape where
 * one gets fixed and the other does not, which is why the lexer moved here out
 * of visual-diff-report.mjs rather than being duplicated.
 *
 * **Text, never `import()`** — inherited constraint, not a preference: the
 * publisher job deliberately runs no `pnpm install`, so `defineConfig` from
 * `@playwright/test` is unresolvable there and importing the config would
 * throw.
 *
 * Pure: no imports at all, no filesystem, no network. Callers own every read.
 * See docs/fixes/visual-tolerance-threshold/architecture.md § Components 6.
 */

/** The three directives this module knows how to read, in a fixed order. */
export const TOLERANCE_KEYS = ["threshold", "maxDiffPixelRatio", "maxDiffPixels"];

/**
 * A numeric literal, and nothing else.
 *
 * The trailing lookahead is what separates a *literal* from an *expression*:
 * `threshold: 0.1 * 2` must be reported unreadable rather than come back as
 * `0.1`. A wrong number here would silently justify a tolerance nobody chose,
 * which is the defect this whole run exists to remove.
 */
function directivePattern(key) {
  return new RegExp(`\\b${key}\\s*:\\s*(\\d[\\d_]*(?:\\.[\\d_]+)?)\\s*(?=[,}\\)\\n]|$)`, "g");
}

function keyPattern(key) {
  return new RegExp(`\\b${key}\\s*:`, "g");
}

/**
 * Strip `//` and block comments while respecting string and template literals,
 * so a `baseURL: "http://…"` cannot swallow the rest of its line.
 *
 * Returns `null` when the source ends inside an unterminated string literal:
 * past that point the lexer cannot tell code from string, so every answer it
 * could give is a guess. Say less rather than guess.
 *
 * Regex literals are deliberately not tracked: a `/` inside one could be read
 * as a comment start, which degrades the answer to `null` rather than
 * producing a wrong number.
 *
 * @param {string} source
 * @returns {string|null}
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
  return quote === null ? out : null;
}

/**
 * Every tolerance fact the config's text carries.
 *
 * `occurrences` is what lets a caller tell three different situations apart
 * that a bare `null` value conflates:
 *
 *   | occurrences | value  | meaning                                        |
 *   | ----------- | ------ | ---------------------------------------------- |
 *   | `0`         | `null` | **absent** — the directive is not set          |
 *   | `1`         | number | **present** and readable                       |
 *   | `1`         | `null` | **present but unreadable** — identifier / expr |
 *   | `> 1`       | `null` | **ambiguous** — e.g. a per-project override    |
 *
 * A non-string, an empty string, or an unterminated string literal yields
 * all-`null` with zero occurrences and never throws.
 *
 * @param {unknown} configSource The config file's text.
 * @returns {{threshold:number|null, maxDiffPixelRatio:number|null,
 *            maxDiffPixels:number|null,
 *            occurrences:{threshold:number, maxDiffPixelRatio:number, maxDiffPixels:number}}}
 */
export function readToleranceDirectives(configSource) {
  const empty = {
    threshold: null,
    maxDiffPixelRatio: null,
    maxDiffPixels: null,
    occurrences: { threshold: 0, maxDiffPixelRatio: 0, maxDiffPixels: 0 },
  };

  if (typeof configSource !== "string" || configSource === "") return empty;

  const source = stripComments(configSource);
  if (source === null) return empty;

  const result = {
    threshold: null,
    maxDiffPixelRatio: null,
    maxDiffPixels: null,
    occurrences: { threshold: 0, maxDiffPixelRatio: 0, maxDiffPixels: 0 },
  };

  for (const key of TOLERANCE_KEYS) {
    const keys = source.match(keyPattern(key)) ?? [];
    result.occurrences[key] = keys.length;
    if (keys.length !== 1) continue;

    const values = [...source.matchAll(directivePattern(key))];
    if (values.length !== 1) continue;

    result[key] = Number(values[0][1].replace(/_/g, ""));
  }

  return result;
}
