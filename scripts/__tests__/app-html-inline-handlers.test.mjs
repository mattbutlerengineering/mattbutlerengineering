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
  for (const tag of scrubbed.match(/<[a-zA-Z][^>]*>/g) ?? []) {
    for (const match of tag.matchAll(/\s(on[a-z]+)\s*=/gi)) {
      found.push({ attribute: match[1], tag: tag.replace(/\s+/g, " ").slice(0, 120) });
    }
  }
  return found;
}

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
