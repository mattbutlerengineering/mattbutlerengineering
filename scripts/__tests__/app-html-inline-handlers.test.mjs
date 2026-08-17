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
 * Opening tags in an HTML string, with quoted attribute values respected.
 *
 * A naive `<[a-zA-Z][^>]*>` terminates the tag at the first `>` — including one
 * inside an attribute value — so `<div title="a>b" onclick="boom()">` scans as
 * a tag ending at `a>` and the real `onclick` is never seen. That is a silent
 * false negative in a guard whose entire job is to make this class un-missable,
 * so the value-aware form is load-bearing, not tidiness.
 */
function openingTags(html) {
  return html.match(/<[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g) ?? [];
}

/**
 * Inline event-handler attributes (`onload=`, `onclick=`, …) in an HTML string.
 *
 * Script bodies and comments are blanked first: `link.addEventListener("load",
 * …)` inside a nonce'd <script> is the *fix* for this defect, not an instance
 * of it, and a prose mention of `onload=` in a comment explaining the fix must
 * not trip the guard either.
 */
function findInlineHandlers(html) {
  const scrubbed = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2");

  const found = [];
  for (const tag of openingTags(scrubbed)) {
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
