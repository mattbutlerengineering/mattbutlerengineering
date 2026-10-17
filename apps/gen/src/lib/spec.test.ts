import { describe, it, expect } from "vitest";
import { decodeSpec, decodeSpecDiff, specStats } from "./spec.js";

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

describe("decodeSpecDiff", () => {
  const sub = (type: string) => ({ root: "card", elements: { card: { type, props: {} } } });
  const diff = { parentId: "p1", path: "card", before: sub("Stack"), after: sub("Grid") };

  it("accepts a well-formed diff, with or without a parent", () => {
    expect(decodeSpecDiff(diff)).toEqual(diff);
    expect(decodeSpecDiff({ ...diff, parentId: null })).toEqual({ ...diff, parentId: null });
  });

  it.each([
    ["null", null],
    ["a string", "diff"],
    ["a numeric parentId", { ...diff, parentId: 3 }],
    ["an empty path", { ...diff, path: "" }],
    ["a malformed before", { ...diff, before: { root: "card" } }],
    ["a malformed after", { ...diff, after: "nope" }],
    ["an after rooted elsewhere", { ...diff, after: { ...sub("Grid"), root: "other" } }],
  ])("rejects %s", (_label, input) => {
    expect(decodeSpecDiff(input)).toBeNull();
  });
});
