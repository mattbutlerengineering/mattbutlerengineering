/**
 * Alias-seam parity tests.
 *
 * ADR-013 moved prop aliases out of the adapters and into declarative `aliases`
 * maps on each `*.catalog.ts`, which flow into `catalogMeta`. The registry seam
 * normalizes incoming props through those maps before an adapter runs (see
 * `applyAliases` in registry.tsx). These tests pin that behaviour so the
 * declarative maps stay load-bearing instead of drifting into dead data:
 *
 *  1. Coverage / mutation guard — the set of declared aliases in `catalogMeta`
 *     must exactly match the hard-coded fixtures below. Renaming, adding, or
 *     removing a declared alias name fails this test.
 *  2. Parity — for every declared alias, rendering with the AI-facing alias prop
 *     produces the same DOM as rendering with the canonical Rialto prop. Because
 *     the fixtures hard-code the alias names, renaming a declared alias in a
 *     `*.catalog.ts` also breaks parity: the old alias name no longer normalizes,
 *     so the alias render diverges from the canonical render.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry } from "../registry.js";
import { catalogMeta } from "../generated-catalog.js";

function renderSpec(spec: Parameters<typeof Renderer>[0]["spec"]) {
  return render(
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

// Mask id-bearing attribute values so two independent renders compare
// structurally: React `useId` (used by Tabs) mints a fresh token per render
// root, so raw ids differ between the alias and canonical renders. Alias
// identity is proven by content / aria-selected / class, not by id values.
function normalizeHtml(html: string): string {
  return html.replace(
    /\b(id|for|aria-controls|aria-labelledby|aria-describedby)="[^"]*"/gi,
    '$1=""'
  );
}

interface AliasCase {
  readonly component: string;
  /** AI-facing alias prop name. */
  readonly alias: string;
  /** Canonical Rialto prop name the alias resolves to. */
  readonly canonical: string;
  /** Value placed under the alias (variant A) / canonical (variant B) key. */
  readonly value: unknown;
  /** Shared props giving each render enough context to be observable. */
  readonly base: Record<string, unknown>;
  /** Text that proves the aliased value rendered through the seam. */
  readonly expectText: string;
}

// One fixture per declared alias. Kept in lockstep with the catalog by the
// "declared aliases ... exactly match" test below.
const ALIAS_CASES: readonly AliasCase[] = [
  {
    component: "Button",
    alias: "label",
    canonical: "children",
    value: "Parity Button Label",
    base: { variant: "primary" },
    expectText: "Parity Button Label",
  },
  {
    component: "Tabs",
    alias: "items",
    canonical: "tabs",
    value: [{ id: "pt", label: "Parity Tab", content: "Parity Panel" }],
    base: { defaultTab: "pt" },
    expectText: "Parity Tab",
  },
  {
    component: "Tabs",
    alias: "defaultValue",
    canonical: "defaultTab",
    value: "second",
    base: {
      tabs: [
        { id: "first", label: "First Tab", content: "First Panel" },
        { id: "second", label: "Second Tab", content: "Second Panel" },
      ],
    },
    expectText: "Second Panel",
  },
  {
    component: "EmptyState",
    alias: "title",
    canonical: "heading",
    value: "Parity Heading",
    base: {},
    expectText: "Parity Heading",
  },
];

function specFor(component: string, props: Record<string, unknown>) {
  return { root: "n", elements: { n: { type: component, props } } };
}

describe("registry alias seam", () => {
  it("declared aliases in catalogMeta exactly match the parity fixtures", () => {
    const declared = Object.entries(catalogMeta)
      .filter(([, meta]) => meta.include !== false && meta.aliases)
      .flatMap(([component, meta]) =>
        Object.entries(meta.aliases ?? {}).map(
          ([alias, canonical]) => `${component}.${alias}->${canonical}`
        )
      )
      .sort();

    const covered = ALIAS_CASES.map((c) => `${c.component}.${c.alias}->${c.canonical}`).sort();

    expect(covered).toEqual(declared);
  });

  it.each(ALIAS_CASES)(
    "$component: alias `$alias` renders identically to canonical `$canonical`",
    ({ component, alias, canonical, value, base, expectText }) => {
      const aliasRender = renderSpec(specFor(component, { ...base, [alias]: value }));
      const canonicalRender = renderSpec(specFor(component, { ...base, [canonical]: value }));

      expect(normalizeHtml(aliasRender.container.innerHTML)).toBe(
        normalizeHtml(canonicalRender.container.innerHTML)
      );
      expect(aliasRender.container.textContent).toContain(expectText);
      expect(canonicalRender.container.textContent).toContain(expectText);
    }
  );
});
