import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = resolve(__dirname, "visual.spec.ts");
const CSS_PATH = resolve(__dirname, "noise-floor-perturbation.css");
const CONFIG_PATH = resolve(__dirname, "../../../playwright.noise-floor.config.ts");
const PRODUCTION_CONFIG_PATH = resolve(__dirname, "../../../playwright.visual.config.ts");

/**
 * The noise-floor measurement's known-regression signal is a CSS file that
 * perturbs every screenshot subject in visual.spec.ts. If a subject is NOT
 * perturbed, the measurement quietly reports "the perturbation is invisible
 * here" and the decision rule's `S` — a minimum — collapses onto it.
 *
 * So coverage is a test, not a comment. Sibling of
 * apps/rialto-web/e2e/noise-floor-coverage.test.ts, adapted to this spec's
 * one subject-construction form: `page.locator(story.selector ??
 * "#storybook-root")`, with per-story `selector:` string-literal overrides.
 *
 * It fails CLOSED. A second `toHaveScreenshot` call site, a changed subject
 * construction, or a `selector:` value that is not a plain string literal is
 * a violation, never silence — the alternative is a new story added with a
 * different subject form silently shrinking the signal set.
 */

const MARKER = ".toHaveScreenshot(";

/** `page.locator(story.selector ?? "<default>")` — the one recognised form. */
const SUBJECT_CONSTRUCTION = /page\.locator\(\s*story\.selector\s*\?\?\s*"([^"]+)"\s*\)/g;

/** A per-story `selector:` entry. The value group is validated separately. */
const SELECTOR_ENTRY = /\bselector:\s*([^\n,}]+)/g;

const STRING_LITERAL = /^"([^"]*)"$/;

/** A CSS file with its comments removed — prose may name what rules must not do. */
function cssRules(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Selectors declared by a CSS file, one entry per comma-separated selector. */
function cssSelectors(css: string): string[] {
  return [...cssRules(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((block) =>
    (block[1] ?? "")
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean)
  );
}

/** Every selector the perturbation must cover, or violations when the spec
 * uses a form this file does not recognise. */
function findCoverageViolations(specSource: string, css: string): string[] {
  const violations: string[] = [];
  const selectors = cssSelectors(css);

  const calls = specSource.split(MARKER).length - 1;
  if (calls === 0) {
    violations.push("no toHaveScreenshot call found — the extractor matched nothing");
  }

  const constructions = [...specSource.matchAll(SUBJECT_CONSTRUCTION)];
  if (constructions.length !== calls) {
    violations.push(
      `spec has ${calls} toHaveScreenshot call(s) but ${constructions.length} recognised ` +
        `subject construction(s) — a subject built any other way is unperturbable silently`
    );
  }

  const required = new Set<string>();
  for (const construction of constructions) {
    if (construction[1] !== undefined) required.add(construction[1]);
  }
  for (const match of specSource.matchAll(SELECTOR_ENTRY)) {
    const value = (match[1] ?? "").trim();
    const literal = STRING_LITERAL.exec(value);
    if (!literal || literal[1] === undefined) {
      violations.push(`unrecognised selector value form: selector: ${value}`);
      continue;
    }
    required.add(literal[1]);
  }

  for (const selector of required) {
    if (!selectors.includes(selector)) {
      violations.push(`subject selector ${selector} is absent from the CSS`);
    }
  }

  return violations;
}

const SPEC = readFileSync(SPEC_PATH, "utf8");
const CSS = readFileSync(CSS_PATH, "utf8");

describe("noise-floor perturbation CSS", () => {
  it("is exactly the subject selectors visual.spec.ts builds screenshots from", () => {
    // "#storybook-root" is the spec's default subject; "html" is its only
    // per-story override (portal-rendered stories). A stray extra selector
    // here would perturb something no screenshot ever captures.
    expect(cssSelectors(CSS)).toEqual(["#storybook-root", "html"]);
  });

  it("carries the documented perturbation value, unchanged", () => {
    // The same opacity the sibling suite's instrument applies
    // (docs/fixes/visual-tolerance-threshold/defect.md § Reproduction) — a
    // different value would measure a different signal, not a comparable one.
    expect(CSS.replace(/\s+/g, "")).toContain("opacity:0.55");
  });

  it("adds no :not(:has(...)) refinement", () => {
    // #storybook-root sits inside <html>, so default subjects composite two
    // stacked opacities (~0.30 effective). That is STRONGER, and the rule's S
    // is a minimum, so the answer is driven by the least-perturbed members.
    // Refining it would silently under-perturb a future nested subject — the
    // dangerous direction. Recorded, not engineered around.
    expect(cssRules(CSS)).not.toContain(":not(");
    expect(cssRules(CSS)).not.toContain(":has(");
  });
});

describe("noise-floor perturbation coverage of visual.spec.ts", () => {
  it("recognises the spec's single subject construction — never zero, never fewer than the calls", () => {
    const calls = SPEC.split(MARKER).length - 1;
    expect(calls).toBeGreaterThan(0);
    expect([...SPEC.matchAll(SUBJECT_CONSTRUCTION)]).toHaveLength(calls);
  });

  it("perturbs every screenshot subject in the spec", () => {
    const violations = findCoverageViolations(SPEC, CSS);
    expect(
      violations,
      `${CSS_PATH} does not perturb every visual.spec.ts screenshot subject:\n` +
        `${violations.join("\n")}\n` +
        "Add the selector to the CSS — an unperturbed subject collapses the rule's S."
    ).toEqual([]);
  });

  it("FAILS CLOSED on a subject construction it does not recognise", () => {
    const synthetic = [
      'test("new snapshot", async ({ page }) => {',
      '  await expect(page.getByRole("dialog")).toHaveScreenshot("new.png");',
      "});",
    ].join("\n");

    const violations = findCoverageViolations(synthetic, CSS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("recognised subject construction");
  });

  it("FAILS CLOSED on a selector value that is not a plain string literal", () => {
    const synthetic =
      `const STORIES = [{ id: "x", label: "X", selector: SOME_CONSTANT }];\n` +
      `await expect(page.locator(story.selector ?? "#storybook-root")).toHaveScreenshot("x.png");`;

    const violations = findCoverageViolations(synthetic, CSS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("unrecognised selector value form");
  });

  it("FAILS CLOSED on a recognised selector the CSS omits", () => {
    const synthetic =
      `const STORIES = [{ id: "x", label: "X", selector: "[data-unperturbed]" }];\n` +
      `await expect(page.locator(story.selector ?? "#storybook-root")).toHaveScreenshot("x.png");`;

    const violations = findCoverageViolations(synthetic, CSS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("[data-unperturbed]");
  });
});

describe("the perturbation config actually loads the CSS", () => {
  it("points toHaveScreenshot.stylePath at noise-floor-perturbation.css", () => {
    // A signal file nothing loads measures nothing.
    const config = readFileSync(CONFIG_PATH, "utf8");
    expect(config).toContain("stylePath");
    expect(config).toContain("noise-floor-perturbation.css");
  });

  it("leaves the production config free of any perturbation branch", () => {
    // A production config that renders differently when an env var is set is a
    // production config that can be perturbed in silence.
    const production = readFileSync(PRODUCTION_CONFIG_PATH, "utf8");
    expect(production).not.toContain("stylePath");

    // A comment in the production config may legitimately MENTION noise-floor
    // (e.g. the provenance lines a measured re-tune will add). A mention on a
    // line that is NOT a comment is what this catches: a perturbation
    // reaching production.
    const live = production
      .split("\n")
      .filter((line) => line.includes("noise-floor") && !/^\s*\/\//.test(line));
    expect(live).toEqual([]);
  });
});
