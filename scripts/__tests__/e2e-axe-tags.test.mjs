import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every Playwright axe scan must run Level A and Level AA rules.
 *
 * Why: in axe-core 4.14.0 the `wcag2aa` tag selects ONLY Level AA rules (3 of
 * 105, e.g. color-contrast). The 63 Level A rules (tags `wcag2a` / `wcag21a`:
 * image-alt, button-name, link-name, label, document-title, html-has-lang, ...)
 * never ran in scans that passed `.withTags(["wcag2aa"])` alone.
 *
 * Static check: every `withTags(...)` call in an app's e2e folder passes either the
 * shared `WCAG_A_AA_TAGS` constant or a literal naming all four tags, and every
 * `WCAG_A_AA_TAGS` definition names all four.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const SHARED_CONSTANT = "WCAG_A_AA_TAGS";

function trackedE2eSources() {
  return execFileSync("git", ["ls-files", "apps/*/e2e/**"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(ts|tsx)$/.test(file));
}

function namesAllTags(text) {
  return REQUIRED_TAGS.every((tag) => text.includes(`"${tag}"`));
}

/** Arguments of every `withTags(...)` call (calls here never nest parens). */
export function withTagsArguments(source) {
  return [...source.matchAll(/\.withTags\(([^)]*)\)/g)].map((match) => match[1].trim());
}

export function offendingArguments(source) {
  return withTagsArguments(source).filter((arg) => arg !== SHARED_CONSTANT && !namesAllTags(arg));
}

const sources = trackedE2eSources().map((file) => ({
  file,
  text: readFileSync(join(ROOT, file), "utf8"),
}));

describe("e2e axe scans cover WCAG Level A and AA", () => {
  const scans = sources.filter(({ text }) => withTagsArguments(text).length > 0);

  it("finds the axe scans", () => {
    expect(scans.length).toBeGreaterThanOrEqual(7);
  });

  it.each(scans)("$file passes every Level A and AA tag to withTags", ({ text }) => {
    expect(offendingArguments(text)).toEqual([]);
  });

  it("flags a wcag2aa-only call (guard self-check)", () => {
    expect(offendingArguments('x.withTags(["wcag2aa"]).analyze()')).toEqual(['["wcag2aa"]']);
  });

  it("every shared constant definition names all four tags", () => {
    const definitions = sources.filter(({ text }) =>
      new RegExp(`export const ${SHARED_CONSTANT}\\b`).test(text)
    );
    for (const { text } of definitions) {
      const body = text.slice(text.indexOf(`export const ${SHARED_CONSTANT}`));
      expect(namesAllTags(body)).toBe(true);
    }
  });
});
