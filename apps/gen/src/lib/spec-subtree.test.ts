import { describe, it, expect } from "vitest";
import type { Spec } from "@json-render/react";
import {
  subtreeKeys,
  extractSubtree,
  ancestorChain,
  spliceSubtree,
  applySpecDiff,
  invertSpecDiff,
  type SpecDiff,
} from "./spec-subtree.js";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const SPEC = {
  root: "page",
  elements: {
    page: { type: "Stack", props: {}, children: ["hero", "footer"] },
    hero: { type: "Card", props: { tone: "a" }, children: ["title", "cta"] },
    title: { type: "Text", props: { content: "Hi" }, children: [] },
    cta: { type: "Button", props: { label: "Go" } },
    footer: { type: "Text", props: { content: "Bye" }, children: [] },
  },
} as unknown as Spec;

const REPLACEMENT = {
  root: "hero",
  elements: {
    hero: { type: "Card", props: { tone: "b" }, children: ["body"] },
    body: { type: "Text", props: { content: "New" }, children: [] },
  },
} as unknown as Spec;

describe("subtreeKeys", () => {
  it("returns the key and all transitive descendants", () => {
    expect(subtreeKeys(SPEC, "hero").sort()).toEqual(["cta", "hero", "title"]);
    expect(subtreeKeys(SPEC, "page")).toHaveLength(5);
  });

  it("returns a leaf as itself and unknown keys as empty", () => {
    expect(subtreeKeys(SPEC, "footer")).toEqual(["footer"]);
    expect(subtreeKeys(SPEC, "nope")).toEqual([]);
  });

  it("terminates on a cyclic spec", () => {
    const cyclic = {
      root: "a",
      elements: {
        a: { type: "Stack", props: {}, children: ["b"] },
        b: { type: "Stack", props: {}, children: ["a"] },
      },
    } as unknown as Spec;
    expect(subtreeKeys(cyclic, "a").sort()).toEqual(["a", "b"]);
  });
});

describe("extractSubtree", () => {
  it("returns a standalone spec rooted at the key", () => {
    const sub = extractSubtree(SPEC, "hero");
    expect(sub?.root).toBe("hero");
    expect(Object.keys(sub!.elements).sort()).toEqual(["cta", "hero", "title"]);
  });

  it("returns null for an unknown key", () => {
    expect(extractSubtree(SPEC, "nope")).toBeNull();
  });
});

describe("ancestorChain", () => {
  it("lists root to parent with types", () => {
    expect(ancestorChain(SPEC, "title")).toEqual([
      { key: "page", type: "Stack" },
      { key: "hero", type: "Card" },
    ]);
  });

  it("is empty for the root and for unknown keys", () => {
    expect(ancestorChain(SPEC, "page")).toEqual([]);
    expect(ancestorChain(SPEC, "nope")).toEqual([]);
  });
});

describe("spliceSubtree", () => {
  it("swaps the subtree, drops orphans, adds replacement descendants", () => {
    const res = spliceSubtree(SPEC, "hero", REPLACEMENT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.spec.elements).sort()).toEqual(["body", "footer", "hero", "page"]);
    expect(res.spec.elements.hero).toEqual(REPLACEMENT.elements.hero);
  });

  it("leaves elements outside the subtree deep-equal and does not mutate input", () => {
    const frozen = deepFreeze(structuredClone(SPEC));
    const res = spliceSubtree(frozen, "hero", deepFreeze(structuredClone(REPLACEMENT)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.spec.elements.page).toEqual(SPEC.elements.page);
    expect(res.spec.elements.footer).toEqual(SPEC.elements.footer);
    expect(res.spec.root).toBe("page");
    expect(frozen).toEqual(SPEC);
  });

  it("rejects a replacement whose root differs from the key", () => {
    const res = spliceSubtree(SPEC, "hero", { ...REPLACEMENT, root: "body" } as Spec);
    expect(res).toEqual({ ok: false, error: "root-mismatch" });
  });

  it("rejects unknown keys", () => {
    const res = spliceSubtree(SPEC, "nope", { ...REPLACEMENT, root: "nope" } as Spec);
    expect(res).toEqual({ ok: false, error: "unknown-key" });
  });

  it("rejects a replacement that reuses a key from outside the subtree", () => {
    const clash = {
      root: "hero",
      elements: {
        hero: { type: "Card", props: {}, children: ["footer"] },
        footer: { type: "Text", props: {}, children: [] },
      },
    } as unknown as Spec;
    expect(spliceSubtree(SPEC, "hero", clash)).toEqual({ ok: false, error: "key-collision" });
  });

  it("rejects a replacement whose root element is missing", () => {
    const res = spliceSubtree(SPEC, "hero", { root: "hero", elements: {} } as Spec);
    expect(res).toEqual({ ok: false, error: "root-mismatch" });
  });
});

describe("SpecDiff", () => {
  const diff: SpecDiff = {
    parentId: "page",
    path: "hero",
    before: extractSubtree(SPEC, "hero")!,
    after: REPLACEMENT,
  };

  it("applies the after subtree", () => {
    const res = applySpecDiff(SPEC, diff);
    expect(res.ok && res.spec.elements.body).toBeTruthy();
  });

  it("round-trips through invert", () => {
    const applied = applySpecDiff(SPEC, diff);
    if (!applied.ok) throw new Error("apply failed");
    const back = applySpecDiff(applied.spec, invertSpecDiff(diff));
    expect(back).toEqual({ ok: true, spec: SPEC });
  });

  it("invert swaps before and after without mutating", () => {
    const inv = invertSpecDiff(diff);
    expect(inv.before).toBe(diff.after);
    expect(inv.after).toBe(diff.before);
    expect(inv.path).toBe("hero");
    expect(inv.parentId).toBe("page");
  });
});
