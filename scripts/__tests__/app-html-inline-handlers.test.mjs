import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const APPS_DIR = resolve(ROOT, "apps");

/**
 * Every app's HTML entry point, discovered rather than listed.
 *
 * A hardcoded list is how this defect survived nine weeks: #3149 fixed the
 * inline font `onload` handler in apps/marketing on 2026-07-04 and the rollout
 * stopped there, leaving apps/rialto-web serving zero web fonts until
 * 2026-08-17. Enumerating the directory means a fifth app is covered the day it
 * is created, with nobody remembering to add it here.
 */
function appHtmlEntries() {
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ app: entry.name, path: resolve(APPS_DIR, entry.name, "index.html") }))
    .filter((entry) => existsSync(entry.path));
}

/**
 * Attributes that begin with `on` but are not event handlers.
 *
 * The name test below is deliberately `on` + letters rather than a list of the
 * HTML spec's event-handler attributes: an allowlist of *handlers* fails silent
 * when it misses one, and silence is the failure mode this whole guard exists
 * to remove. So unknown `on*` attributes are flagged (loud, recoverable) and
 * only known non-handlers are excused here. Add to this list when a real one
 * appears — never widen the name test.
 */
const NON_HANDLER_ON_ATTRIBUTES = new Set(["once", "only", "onward"]);

/**
 * Opening tags in an HTML string, scanned rather than pattern-matched.
 *
 * This was three separate regexes and each one had a hole. `<[a-zA-Z][^>]*>`
 * ended a tag at the first `>`, including one inside an attribute value, so
 * `<div title="a>b" onclick="boom()">` was missed. Stripping script bodies with
 * `[\s\S]*?<\/script>` did not match `</script >`, leaving the body unscrubbed
 * (CodeQL js/bad-tag-filter). Stripping comments with a single `.replace()` can
 * leave a `<!--` behind (CodeQL js/incomplete-multi-character-sanitization).
 *
 * Every one of those is a *silent false negative* in a guard whose whole job is
 * to make a class of defect un-missable. A character scan has no such corners:
 * quotes are tracked explicitly, comments are skipped by index, and raw-text
 * element bodies are skipped by locating the real end tag with optional
 * whitespace. Regexes are not used for structure here on purpose.
 */
function openingTags(html) {
  const lower = html.toLowerCase();
  const tags = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;

    if (lower.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close === -1 ? html.length : close + 3;
      continue;
    }

    // Walk to the tag's real end, treating `>` inside a quoted value as data.
    let j = lt + 1;
    let quote = null;
    while (j < html.length) {
      const ch = html[j];
      if (quote !== null) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      j += 1;
    }
    if (j >= html.length) break;

    const tag = html.slice(lt, j + 1);
    i = j + 1;

    const name = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag)?.[1]?.toLowerCase();
    if (name === undefined) continue; // doctype, closing tag, stray `<`
    tags.push(tag);

    // Raw-text elements: their body is text, not markup. Skip to the real end
    // tag, which may carry whitespace before `>` (`</script >` is valid).
    if (name === "script" || name === "style") {
      let from = i;
      for (;;) {
        const close = lower.indexOf(`</${name}`, from);
        if (close === -1) {
          i = html.length;
          break;
        }
        let after = close + name.length + 2;
        while (after < html.length && /\s/.test(html[after])) after += 1;
        if (html[after] === ">") {
          i = after + 1;
          break;
        }
        from = close + 1;
      }
    }
  }

  return tags;
}

/**
 * Inline event-handler attributes (`onload=`, `onclick=`, …) in an HTML string.
 *
 * Comments and raw-text bodies are already excluded by openingTags: a nonce'd
 * `link.addEventListener("load", …)` is the *fix* for this defect, not an
 * instance of it, and a comment explaining the fix must not trip the guard.
 */
function findInlineHandlers(html) {
  const found = [];
  for (const tag of openingTags(html)) {
    for (const match of tag.matchAll(/\s(on[a-z]+)\s*=/gi)) {
      if (NON_HANDLER_ON_ATTRIBUTES.has(match[1].toLowerCase())) continue;
      found.push({ attribute: match[1], tag: tag.replace(/\s+/g, " ").slice(0, 120) });
    }
  }
  return found;
}

describe("findInlineHandlers", () => {
  // The guard blocks CI, so both of its error directions matter — but not
  // equally. A false positive is loud and recoverable; a false negative is
  // silent and reinstates the defect. These pin both.
  it("flags a real handler, in any case", () => {
    expect(findInlineHandlers(`<link rel=preload onload="x" />`)[0].attribute).toBe("onload");
    expect(findInlineHandlers(`<link ONLOAD="x" />`)[0].attribute).toBe("ONLOAD");
  });

  it("finds a handler that follows a '>' inside an attribute value", () => {
    // Regression: the naive tag regex ended the tag at `a>` and missed onclick.
    expect(findInlineHandlers(`<div title="a>b" onclick="boom()"></div>`)).toHaveLength(1);
  });

  it("does not flag attributes that merely start with 'on'", () => {
    expect(findInlineHandlers(`<my-el once="true" only="a"></my-el>`)).toEqual([]);
    expect(findInlineHandlers(`<div data-on-click="x"></div>`)).toEqual([]);
  });

  it("ignores script bodies and comments", () => {
    expect(findInlineHandlers(`<script>el.addEventListener("load", f)</script>`)).toEqual([]);
    expect(findInlineHandlers(`<!-- never use onload="x" -->`)).toEqual([]);
  });

  it("skips a script body closed by `</script >` with whitespace", () => {
    // Regression, CodeQL js/bad-tag-filter: the old `<\/script>` pattern did not
    // match `</script >`, so the body stayed unscrubbed and its contents were
    // parsed as markup. Measured effect was a false positive — both of these
    // returned ["onload"] for an attribute that only exists inside a JS string.
    expect(findInlineHandlers(`<script>w('<b onload="x">')</script >`)).toEqual([]);
    expect(findInlineHandlers(`<style>a{b:'<i onload="x">'}</style >`)).toEqual([]);
  });

  it("still flags a handler that follows a skipped script or comment", () => {
    // The skip must resume scanning, not swallow the rest of the document.
    expect(findInlineHandlers(`<script>f()</script ><div onclick="x"></div>`)).toHaveLength(1);
    expect(findInlineHandlers(`<!-- <!-- --><div onclick="x"></div>`)).toHaveLength(1);
  });
});

describe("apps/*/index.html inline event handlers", () => {
  it("discovers at least one app HTML entry", () => {
    // A guard that silently scans nothing passes vacuously and reads exactly
    // like a guard that found nothing wrong — the failure mode that let
    // rialto-web-visual.yml pin one spec while six others never ran (#3955).
    expect(appHtmlEntries().length).toBeGreaterThan(0);
  });

  it.each(appHtmlEntries())("$app has no inline event-handler attribute", ({ app, path }) => {
    const handlers = findInlineHandlers(readFileSync(path, "utf8"));

    expect(
      handlers,
      handlers.length === 0
        ? ""
        : [
            `apps/${app}/index.html carries ${handlers.length} inline event-handler ` +
              `attribute(s): ${handlers.map((h) => h.attribute).join(", ")}.`,
            "",
            ...handlers.map((h) => `  ${h.tag}`),
            "",
            "The edge CSP sets script-src 'nonce-<nonce>' 'self' with no 'unsafe-inline'",
            "(infrastructure/worker/csp.js), and injectNonceIntoHtml only adds a nonce to",
            "<script> *tags* — an event-handler *attribute* cannot carry one, so the browser",
            "refuses it on every page load with no server-side signal that it happened.",
            "",
            "Move the behaviour into a <script> block the edge can nonce. See the",
            "data-font-stylesheet pattern in apps/marketing/index.html (#3149), and",
            "docs/fixes/rialto-web-fonts/defect.md for what this cost when it was missed.",
          ].join("\n")
    ).toEqual([]);
  });
});
