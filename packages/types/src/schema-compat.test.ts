import { describe, it, expect } from "vitest";
import { compareSchema } from "./schema-compat.js";

describe("Schema Compatibility Utility", () => {
  it("detects compatible schemas", () => {
    const baseline = {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    };
    const current = {
      type: "object",
      properties: { 
        id: { type: "string" },
        name: { type: "string" } 
      },
      required: ["id"],
    };
    
    const result = compareSchema("Test", baseline, current);
    expect(result.breaking).toHaveLength(0);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]).toContain("optional property \"name\" was added");
  });

  it("detects breaking changes (field removal)", () => {
    const baseline = {
      type: "object",
      properties: { id: { type: "string" }, old: { type: "number" } },
      required: ["id"],
    };
    const current = {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    };
    
    const result = compareSchema("Test", baseline, current);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]).toContain("property \"old\" was removed");
  });

  it("detects breaking changes (type change)", () => {
    const baseline = {
      type: "object",
      properties: { id: { type: "string" } },
    };
    const current = {
      type: "object",
      properties: { id: { type: "number" } },
    };
    
    const result = compareSchema("Test", baseline, current);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]).toContain("type changed from \"string\" to \"number\"");
  });

  it("detects breaking changes (new required field)", () => {
    const baseline = { type: "object", properties: { a: { type: "string" } } };
    const current = { 
      type: "object", 
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["b"]
    };
    const result = compareSchema("Test", baseline, current);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]).toContain("required property \"b\" was added");
  });

  it("detects non-breaking changes (required to optional)", () => {
    const baseline = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const current = { type: "object", properties: { a: { type: "string" } } };
    const result = compareSchema("Test", baseline, current);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]).toContain("property \"a\" became optional");
  });

  it("detects enum changes", () => {
    const baseline = { type: "object", properties: { e: { enum: ["a", "b"] } } };
    const currentNarrow = { type: "object", properties: { e: { enum: ["a"] } } };
    const currentWider = { type: "object", properties: { e: { enum: ["a", "b", "c"] } } };

    const res1 = compareSchema("Test", baseline, currentNarrow);
    expect(res1.breaking).toHaveLength(1);
    expect(res1.breaking[0]).toContain("enum values removed: b");

    const res2 = compareSchema("Test", baseline, currentWider);
    expect(res2.nonBreaking).toHaveLength(1);
    expect(res2.nonBreaking[0]).toContain("enum values added: c");
  });

  it("detects nullable changes", () => {
    const baseline = { type: "object", properties: { n: { type: "string", nullable: true } } };
    const currentNotNull = { type: "object", properties: { n: { type: "string" } } };
    const res1 = compareSchema("Test", baseline, currentNotNull);
    expect(res1.breaking).toHaveLength(1);
    expect(res1.breaking[0]).toContain("no longer nullable");

    const currentNullable = { type: "object", properties: { n: { type: "string", nullable: true } } };
    const res2 = compareSchema("Test", currentNotNull, currentNullable);
    expect(res2.nonBreaking).toHaveLength(1);
    expect(res2.nonBreaking[0]).toContain("became nullable");
  });

  it("detects cosmetic changes", () => {
    const baseline = { type: "object", properties: { a: { type: "string", description: "old" } } };
    const current = { type: "object", properties: { a: { type: "string", description: "new" } } };
    const result = compareSchema("Test", baseline, current);
    expect(result.nonBreaking).toHaveLength(1);
    expect(result.nonBreaking[0]).toContain("description changed");
  });

  it("detects breaking changes (optional to required transition)", () => {
    const baseline = { type: "object", properties: { a: { type: "string" } } };
    const current = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const result = compareSchema("Test", baseline, current);
    expect(result.breaking).toHaveLength(1);
    expect(result.breaking[0]).toContain("property \"a\" became required");
  });

  it("handles missing schemas", () => {
    const res1 = compareSchema("Test", { type: "object" }, undefined);
    expect(res1.breaking[0]).toContain("removed");

    const res2 = compareSchema("Test", undefined, { type: "object" });
    expect(res2.nonBreaking[0]).toContain("new");
  });
});
