import { describe, it, expect } from "vitest";
import { decodeSpec, specStats } from "./spec.js";

const FLAT_SPEC = {
  root: "page",
  elements: {
    page: { type: "Stack", props: {}, children: ["title", "cta"] },
    title: { type: "Text", props: { content: "Hi" }, children: [] },
    cta: { type: "Button", props: { label: "Go" }, children: [] },
    cta2: { type: "Button", props: { label: "Again" }, children: [] },
  },
};

describe("specStats", () => {
  it("counts elements in a flat spec and lists distinct sorted types", () => {
    expect(specStats(decodeSpec(FLAT_SPEC))).toEqual({
      elementCount: 4,
      componentTypes: ["Button", "Stack", "Text"],
    });
  });

  it("returns null for no spec", () => {
    expect(specStats(null)).toBeNull();
  });

  it("reports zero elements for the empty spec", () => {
    expect(specStats(decodeSpec({ root: "", elements: {} }))).toEqual({
      elementCount: 0,
      componentTypes: [],
    });
  });
});

describe("decodeSpec", () => {
  it("accepts a well-formed flat spec", () => {
    expect(decodeSpec(FLAT_SPEC)).toEqual(FLAT_SPEC);
  });

  it.each([
    ["null", null],
    ["a string", "spec"],
    ["an array", []],
    ["missing elements", { root: "a" }],
    ["non-string root", { root: 1, elements: {} }],
    ["elements as array", { root: "a", elements: [] }],
    ["element without type", { root: "a", elements: { a: { props: {} } } }],
    ["element that is not an object", { root: "a", elements: { a: "x" } }],
    ["legacy tree shape", { type: "Box", children: [{ type: "Text" }] }],
  ])("rejects %s", (_label, input) => {
    expect(decodeSpec(input)).toBeNull();
  });
});
