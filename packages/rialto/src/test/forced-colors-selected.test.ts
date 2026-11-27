/// <reference types="node" />
// @vitest-environment node
/**
 * Forced-colors selected-state + shadow-boundary guard, and the
 * `prefers-contrast: more` token remap (#9741).
 *
 * forced-colors mode flattens backgrounds and strips box-shadow, so a state
 * that reads only by background colour, or a surface bounded only by a shadow,
 * disappears. jsdom cannot emulate either media feature, so this parses the
 * CSS source.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Escape every regex metacharacter, backslash included. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function read(rel: string): string {
  return readFileSync(join(SRC_DIR, rel), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Bodies of every `@media (<feature>)` block, braces balanced. */
function mediaBlocks(css: string, feature: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(`@media (${feature})`, from);
    if (at === -1) return blocks;
    const open = css.indexOf("{", at);
    let depth = 1;
    let i = open + 1;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    blocks.push(css.slice(open + 1, i - 1));
    from = i;
  }
}

function forcedColors(rel: string): string {
  return mediaBlocks(read(rel), "forced-colors: active").join("\n");
}

const SELECTED: Record<string, string[]> = {
  "components/Calendar/Calendar.module.css": [".daySelected"],
  "components/DateRange/DateRange.module.css": [".rangeStart", ".rangeEnd", ".inRange"],
  "components/Select/Select.module.css": [
    '.option[data-selected="true"]',
    '.option[data-focused="true"]',
  ],
  "components/Combobox/Combobox.module.css": ['.option[data-selected="true"]', ".optionActive"],
  "components/Tabs/Tabs.module.css": [".tabActive"],
  "components/Toggle/Toggle.module.css": ['.track[data-checked="true"]'],
  "components/Checkbox/Checkbox.module.css": [".input:checked + .box", ".input:checked + .circle"],
  "components/Steps/Steps.module.css": [".current .node"],
  "components/SegmentedControl/SegmentedControl.module.css": [".segmentActive", ".indicator"],
};

const SHADOW_ONLY: Record<string, string> = {
  "components/Card/Card.module.css": ".card",
  "components/Input/Input.module.css": ".input",
  "components/Select/Select.module.css": ".trigger",
  "components/Popover/Popover.module.css": ".panel",
  "components/Dialog/Dialog.module.css": ".panel",
};

describe("rialto forced-colors selected states", () => {
  for (const [file, selectors] of Object.entries(SELECTED)) {
    for (const selector of selectors) {
      it(`${file} styles ${selector} under forced-colors: active`, () => {
        expect(forcedColors(file)).toContain(selector);
      });
    }
  }

  it("keeps child marks legible on the Highlight fill", () => {
    expect(forcedColors("components/Checkbox/Checkbox.module.css")).toContain(
      ".input:checked + .box .check"
    );
    expect(forcedColors("components/Checkbox/Checkbox.module.css")).toContain(
      ".input:checked + .circle .dot"
    );
    for (const c of ["Select", "Combobox"]) {
      expect(forcedColors(`components/${c}/${c}.module.css`)).toContain(
        '.option[data-selected="true"] .check'
      );
    }
  });

  it("keeps the indeterminate dash legible", () => {
    expect(forcedColors("components/Checkbox/Checkbox.module.css")).toContain(
      '.input[data-indeterminate="true"] + .box .check'
    );
  });

  it("uses system colours, never hex", () => {
    for (const file of [...Object.keys(SELECTED), ...Object.keys(SHADOW_ONLY)]) {
      expect(forcedColors(file), file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});

// `forced-color-adjust: none` on a selected fill also stops the UA repainting
// the transparent focus outline (#9727), leaving only a low-alpha glow (#9857).
const FOCUS_UNDER_NONE: Record<string, string[]> = {
  "components/Checkbox/Checkbox.module.css": [
    ".input:focus-visible + .box",
    ".input:focus-visible + .circle",
  ],
  "components/Toggle/Toggle.module.css": [".input:focus-visible + .track"],
  "components/Calendar/Calendar.module.css": [".daySelected:focus-visible"],
  "components/DateRange/DateRange.module.css": [
    ".rangeStart:focus-visible",
    ".rangeEnd:focus-visible",
  ],
};

/** Declarations of the forced-colors rules whose selector list names `selector`. */
function forcedRuleBodies(rel: string, selector: string): string[] {
  const rules = forcedColors(rel).matchAll(/([^{}]+)\{([^{}]*)\}/g);
  return [...rules]
    .filter(([, sel]) => sel.split(",").some((part) => part.trim() === selector))
    .map(([, , body]) => body);
}

describe("rialto forced-colors focus ring on adjusted fills", () => {
  for (const [file, selectors] of Object.entries(FOCUS_UNDER_NONE)) {
    for (const selector of selectors) {
      it(`${file} paints a CanvasText outline on ${selector}`, () => {
        const bodies = forcedRuleBodies(file, selector);
        expect(bodies.some((body) => /outline-color:\s*CanvasText/.test(body))).toBe(true);
      });
    }
  }
});

describe("rialto forced-colors shadow-only boundaries", () => {
  for (const [file, selector] of Object.entries(SHADOW_ONLY)) {
    it(`${file} draws an edge on ${selector}`, () => {
      const block = forcedColors(file);
      const rule = new RegExp(`${escapeRegExp(selector)}\\s*\\{[^}]*border[^}]*\\}`);
      expect(block).toMatch(rule);
    });
  }
});

describe("rialto prefers-contrast: more tokens", () => {
  const css = read("tokens/contrast.css");
  const scopes = [
    ":root",
    '[data-theme="dark"]',
    '[data-theme="dark"] [data-theme="light"]',
    '[data-surface="tinted"]',
    '[data-theme="dark"] [data-theme="light"] [data-surface="tinted"]',
    '[data-surface="velvet"]',
    '[data-theme="dark"] [data-surface="velvet"]',
    '[data-theme="dark"] [data-theme="light"] [data-surface="velvet"]',
  ];
  const block = mediaBlocks(css, "prefers-contrast: more").join("\n");

  it("is imported by the token index", () => {
    expect(read("tokens/index.css")).toContain('@import "./contrast.css"');
  });

  for (const scope of scopes) {
    it(`remaps the three tokens in ${scope}`, () => {
      const rule = new RegExp(`(^|[\\s}])${escapeRegExp(scope)}\\s*\\{([^}]*)\\}`);
      const body = rule.exec(block)?.[2] ?? "";
      expect(body).toMatch(/--rialto-text-secondary:\s*var\(--rialto-text-primary\)/);
      expect(body).toMatch(/--rialto-text-tertiary:\s*var\(--rialto-text-primary\)/);
      expect(body).toMatch(/--rialto-border:\s*var\(--rialto-border-strong\)/);
    });
  }

  it("adds no hex values", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
