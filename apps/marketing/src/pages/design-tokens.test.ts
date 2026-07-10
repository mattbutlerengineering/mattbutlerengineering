/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// Guards against the invalid-token regression class (originally the /weekly
// page, then AiHealthPage + MetricsPage): var(--color-*) / var(--space-*) and
// any other non-rialto custom properties do NOT exist in this app — only
// --rialto-* tokens are defined. A literal hex fallback lets such a page
// render "fine" in light mode while silently ignoring the theme (no brand
// colour, no dark-mode response), so a namespace guard is the only thing that
// catches it. Scan every CSS module's RAW source (not a vite/CSS-modules
// import, which rewrites class names and would hide the authored var() text)
// so the invariant holds for the next page too.
const SRC_DIR = join(process.cwd(), "src");

function collectModuleCssFiles(dir: string, base: string = dir): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectModuleCssFiles(full, base);
    return entry.isFile() && entry.name.endsWith(".module.css") ? [relative(base, full)] : [];
  });
}

const cssModules = collectModuleCssFiles(SRC_DIR);

describe("marketing CSS module design tokens", () => {
  it("discovers CSS modules to guard", () => {
    expect(cssModules.length).toBeGreaterThan(0);
  });

  it.each(cssModules)("%s references only --rialto-* custom properties", (relPath) => {
    const css = readFileSync(join(SRC_DIR, relPath), "utf8");
    const vars = css.match(/var\(\s*--[a-z0-9-]+/gi) ?? [];
    const offenders = vars.filter((ref) => !ref.includes("--rialto-"));
    expect(offenders).toEqual([]);
  });
});
