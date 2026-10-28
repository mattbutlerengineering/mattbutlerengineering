import { describe, expect, it } from "vitest";
import type { Spec } from "@json-render/react";
import { specHasVisibleContent } from "./visible-content.js";

describe("specHasVisibleContent", () => {
  it("is false for a grid that is only empty stacks", () => {
    const spec: Spec = {
      root: "column",
      elements: {
        column: { type: "Stack", props: { direction: "column", gap: "md" }, children: ["grid"] },
        grid: { type: "Stack", props: { direction: "row", gap: "md", wrap: true }, children: [] },
      },
    };
    expect(specHasVisibleContent(spec)).toBe(false);
  });

  it("is true when a stack contains text or a control", () => {
    const spec: Spec = {
      root: "column",
      elements: {
        column: { type: "Stack", props: {}, children: ["label"] },
        label: { type: "Text", props: { children: "Field 1" }, children: [] },
      },
    };
    expect(specHasVisibleContent(spec)).toBe(true);
  });

  it("is false for a null spec", () => {
    expect(specHasVisibleContent(null)).toBe(false);
  });
});
