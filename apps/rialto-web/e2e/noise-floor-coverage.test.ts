import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = resolve(__dirname, "visual.spec.ts");
const CSS_PATH = resolve(__dirname, "noise-floor-perturbation.css");
const CONFIG_PATH = resolve(__dirname, "../playwright.noise-floor.config.ts");

/**
 * The noise-floor measurement's known-regression signal is a CSS file that
 * perturbs every screenshot subject in visual.spec.ts. If a subject is NOT
 * perturbed, the measurement quietly reports it as "the perturbation is
 * invisible here" and the rule's `S` — a minimum — collapses onto it.
 *
 * So coverage is a test, not a comment. Precedent and the same failure class:
 * the neighbouring workflow-coverage.test.ts, which exists because six real
 * specs sat in this directory never running in CI (#3955).
 *
 * It fails CLOSED. A subject-locator form this file does not recognise is a
 * violation, never silence — the alternative is a 50th snapshot added with a
 * third locator form silently shrinking the signal set.
 */

const MARKER = ".toHaveScreenshot(";

/** Every `expect(<subject>)` expression that feeds a `toHaveScreenshot` call. */
function subjectExpressions(source: string): string[] {
  const found: string[] = [];

  for (let idx = source.indexOf(MARKER); idx !== -1; idx = source.indexOf(MARKER, idx + 1)) {
    let i = idx - 1;
    while (i >= 0 && /\s/.test(source[i])) i -= 1;

    // Anything that is not a balanced `expect( … )` is recorded verbatim so it
    // reaches the classifier as unrecognised, rather than being skipped.
    if (source[i] !== ")") {
      found.push(source.slice(Math.max(0, idx - 40), idx).trim());
      continue;
    }

    const close = i;
    let depth = 0;
    let open = -1;
    for (; i >= 0; i -= 1) {
      if (source[i] === ")") depth += 1;
      else if (source[i] === "(") {
        depth -= 1;
        if (depth === 0) {
          open = i;
          break;
        }
      }
    }

    if (open === -1 || !/\bexpect\s*$/.test(source.slice(0, open))) {
      found.push(source.slice(Math.max(0, idx - 40), idx).trim());
      continue;
    }

    found.push(source.slice(open + 1, close).trim());
  }

  return found;
}

/** `const section = page.getByTestId(id)` — resolve a bare name to its initialiser. */
function resolveSubject(expression: string, source: string): string {
  if (!/^[A-Za-z_$][\w$]*$/.test(expression)) return expression;
  const declaration = new RegExp(`\\b(?:const|let|var)\\s+${expression}\\s*=\\s*([^;]+);`);
  const match = source.match(declaration);
  // An unresolved name stays a bare name, which no recognised form matches —
  // so it surfaces as a violation instead of vanishing.
  return match ? match[1].trim() : expression;
}

/** The CSS selector that must perturb this subject, or `null` if unrecognised. */
function selectorFor(expression: string): string | null {
  if (/^page\.getByTestId\([\s\S]*\)$/.test(expression)) return "[data-testid]";
  const locator = expression.match(/^page\.locator\(\s*(["'`])([^"'`]*)\1\s*\)$/);
  if (locator) return locator[2];
  return null;
}

/** A CSS file with its comments removed — prose may name what the rules must not do. */
function cssRules(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Selectors declared by a CSS file, one entry per comma-separated selector. */
function cssSelectors(css: string): string[] {
  return [...cssRules(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((block) =>
    block[1]
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean)
  );
}

/** Subjects whose selector is unrecognised, or recognised but not in the CSS. */
function findCoverageViolations(specSource: string, css: string): string[] {
  const selectors = cssSelectors(css);
  const violations: string[] = [];

  for (const raw of subjectExpressions(specSource)) {
    const expression = resolveSubject(raw, specSource);
    const selector = selectorFor(expression);
    if (selector === null) {
      violations.push(`unrecognised subject-locator form: ${expression}`);
    } else if (!selectors.includes(selector)) {
      violations.push(`subject ${expression} needs selector ${selector}, absent from the CSS`);
    }
  }

  return violations;
}

const SPEC = readFileSync(SPEC_PATH, "utf8");
const CSS = readFileSync(CSS_PATH, "utf8");

describe("noise-floor perturbation CSS", () => {
  it("is exactly the two selectors that visual.spec.ts builds subjects from", () => {
    expect(cssSelectors(CSS)).toEqual(["[data-testid]", "[data-feed-state]"]);
  });

  it("carries the prior run's perturbation value, unchanged", () => {
    // defect.md § Reproduction records the emitted CSS as
    // `…[data-testid=button-variants],…{opacity:.55}`. Same property, same
    // value, same mechanism — only the enumeration is replaced by the attribute.
    expect(CSS.replace(/\s+/g, "")).toContain("opacity:0.55");
  });

  it("adds no :not(:has(...)) refinement", () => {
    // DarkModeSection wraps nine sections in a testid'd div, so those nine
    // composite two stacked opacities (~0.30 effective). That is STRONGER, and
    // `S` is a minimum, so the answer is driven by the least-perturbed members.
    // Refining it would silently under-perturb any future nested subject — the
    // dangerous direction. Recorded, not engineered around.
    expect(cssRules(CSS)).not.toContain(":not(");
    expect(cssRules(CSS)).not.toContain(":has(");
  });
});

describe("noise-floor perturbation coverage of visual.spec.ts", () => {
  it("finds every toHaveScreenshot subject — never zero, never fewer than the calls", () => {
    // Without this, an extractor that silently matched nothing would make every
    // coverage assertion below pass vacuously.
    const calls = SPEC.split(MARKER).length - 1;
    expect(calls).toBeGreaterThan(0);
    expect(subjectExpressions(SPEC)).toHaveLength(calls);
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

  it("resolves both known locator forms, through a variable and inline", () => {
    const forms = subjectExpressions(SPEC).map((raw) => resolveSubject(raw, SPEC));
    expect(forms.some((f) => f.startsWith("page.getByTestId("))).toBe(true);
    expect(forms.some((f) => f.startsWith("page.locator("))).toBe(true);
  });

  it("FAILS CLOSED on a third locator form it does not recognise", () => {
    const synthetic = [
      'test("new snapshot", async ({ page }) => {',
      '  await expect(page.getByRole("button")).toHaveScreenshot("new.png");',
      "});",
    ].join("\n");

    const violations = findCoverageViolations(synthetic, CSS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("unrecognised subject-locator form");
    expect(violations[0]).toContain("getByRole");
  });

  it("FAILS CLOSED on a recognised form whose selector the CSS omits", () => {
    const synthetic = 'await expect(page.locator("[data-unperturbed]")).toHaveScreenshot("x.png");';
    const violations = findCoverageViolations(synthetic, CSS);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("[data-unperturbed]");
  });
});

describe("the perturbation config actually loads the CSS", () => {
  it("points toHaveScreenshot.stylePath at noise-floor-perturbation.css", () => {
    // A signal file nothing loads measures nothing. `stylePath` is a
    // config-level toHaveScreenshot option in the installed Playwright 1.62.1
    // (playwright/types/test.d.ts:233).
    const config = readFileSync(CONFIG_PATH, "utf8");
    expect(config).toContain("stylePath");
    expect(config).toContain("noise-floor-perturbation.css");
  });

  it("leaves the production config free of any perturbation branch", () => {
    // A production config that renders differently when an env var is set is a
    // production config that can be perturbed in silence.
    const production = readFileSync(resolve(__dirname, "../playwright.config.ts"), "utf8");
    expect(production).not.toContain("stylePath");
    expect(production).not.toContain("noise-floor-perturbation");

    // The production config does legitimately say "noise-floor" — the two
    // provenance comment lines the tolerance declaration carries, naming the
    // measurement its values came from (architecture.md § Data model). Those
    // are inert text. A mention on a line that is NOT a comment is the thing
    // this test exists to catch: a perturbation reaching production.
    const live = production
      .split("\n")
      .filter((line) => line.includes("noise-floor") && !/^\s*\/\//.test(line));
    expect(live).toEqual([]);
  });
});
