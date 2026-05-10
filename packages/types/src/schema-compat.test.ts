import { describe, it, expect } from "vitest";
import { compareSchema } from "./schema-compat.js";

describe("compareSchema", () => {
  describe("schema-level changes", () => {
    it("detects schema removal as breaking", () => {
      const result = compareSchema("MySchema", { type: "object" }, undefined);
      expect(result.breaking).toHaveLength(1);
      expect(result.breaking[0]).toContain("was removed");
      expect(result.nonBreaking).toHaveLength(0);
    });

    it("detects new schema as non-breaking", () => {
      const result = compareSchema("NewSchema", undefined, { type: "object" });
      expect(result.nonBreaking).toHaveLength(1);
      expect(result.nonBreaking[0]).toContain("is new");
      expect(result.breaking).toHaveLength(0);
    });

    it("returns empty arrays for identical schemas", () => {
      const schema = {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      };
      const result = compareSchema("Same", schema, schema);
      expect(result.breaking).toHaveLength(0);
      expect(result.nonBreaking).toHaveLength(0);
    });

    it("handles schemas with no properties", () => {
      const result = compareSchema("Empty", { type: "object" }, { type: "object" });
      expect(result.breaking).toHaveLength(0);
      expect(result.nonBreaking).toHaveLength(0);
    });
  });

  describe("property addition", () => {
    it("detects optional property addition as non-breaking", () => {
      const baseline = {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      };
      const current = {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" } },
        required: ["id"],
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(0);
      expect(result.nonBreaking).toHaveLength(1);
      expect(result.nonBreaking[0]).toContain("optional property \"name\" was added");
    });

    it("detects required property addition as breaking", () => {
      const baseline = {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      };
      const current = {
        type: "object",
        properties: { id: { type: "string" }, email: { type: "string" } },
        required: ["id", "email"],
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(1);
      expect(result.breaking[0]).toContain("required property \"email\" was added");
    });

    it("handles multiple new optional properties", () => {
      const baseline = {
        type: "object",
        properties: { id: { type: "string" } },
      };
      const current = {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          age: { type: "number" },
        },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.nonBreaking).toHaveLength(2);
    });
  });

  describe("property removal", () => {
    it("detects field removal as breaking", () => {
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

    it("detects multiple field removals", () => {
      const baseline = {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } },
      };
      const current = {
        type: "object",
        properties: { a: { type: "string" } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(2);
    });
  });

  describe("type changes", () => {
    it("detects type change as breaking", () => {
      const baseline = {
        type: "object",
        properties: { count: { type: "string" } },
      };
      const current = {
        type: "object",
        properties: { count: { type: "number" } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(1);
      expect(result.breaking[0]).toContain("type changed from \"string\" to \"number\"");
    });

    it("does not report type change when types match", () => {
      const baseline = {
        type: "object",
        properties: { name: { type: "string" } },
      };
      const current = {
        type: "object",
        properties: { name: { type: "string" } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(0);
    });

    it("skips type comparison when one side has no type", () => {
      const baseline = {
        type: "object",
        properties: { data: {} },
      };
      const current = {
        type: "object",
        properties: { data: { type: "string" } },
      };
      const result = compareSchema("Test", baseline, current);
      // No type change because baseline has no explicit type
      expect(result.breaking).toHaveLength(0);
    });
  });

  describe("required constraint changes", () => {
    it("detects optional-to-required transition as breaking", () => {
      const baseline = {
        type: "object",
        properties: { name: { type: "string" } },
      };
      const current = {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(1);
      expect(result.breaking[0]).toContain("property \"name\" became required");
    });

    it("detects required-to-optional transition as non-breaking", () => {
      const baseline = {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      };
      const current = {
        type: "object",
        properties: { name: { type: "string" } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.nonBreaking).toHaveLength(1);
      expect(result.nonBreaking[0]).toContain("property \"name\" became optional");
    });

    it("does not report required change for newly added fields", () => {
      // This is tested by the "required property addition" test path
      const baseline = {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      };
      const current = {
        type: "object",
        properties: { id: { type: "string" }, email: { type: "string" } },
        required: ["id", "email"],
      };
      const result = compareSchema("Test", baseline, current);
      // "email" is a new field, so it goes through the "new property" path, not "became required"
      const becameRequired = result.breaking.filter((m) => m.includes("became required"));
      expect(becameRequired).toHaveLength(0);
    });

    it("does not report required change for removed fields", () => {
      const baseline = {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" } },
        required: ["a", "b"],
      };
      const current = {
        type: "object",
        properties: { a: { type: "string" } },
        required: ["a"],
      };
      const result = compareSchema("Test", baseline, current);
      // "b" was removed — only counts as "removed", not as "became optional"
      expect(result.breaking).toHaveLength(1);
      expect(result.breaking[0]).toContain("removed");
      expect(result.nonBreaking).toHaveLength(0);
    });
  });

  describe("enum changes", () => {
    it("detects enum narrowing as breaking", () => {
      const baseline = {
        type: "object",
        properties: { status: { enum: ["active", "inactive", "pending"] } },
      };
      const current = {
        type: "object",
        properties: { status: { enum: ["active", "inactive"] } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(1);
      expect(result.breaking[0]).toContain("enum values removed: pending");
    });

    it("detects enum widening as non-breaking", () => {
      const baseline = {
        type: "object",
        properties: { role: { enum: ["admin", "user"] } },
      };
      const current = {
        type: "object",
        properties: { role: { enum: ["admin", "user", "moderator"] } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.nonBreaking).toHaveLength(1);
      expect(result.nonBreaking[0]).toContain("enum values added: moderator");
    });

    it("detects simultaneous enum addition and removal", () => {
      const baseline = {
        type: "object",
        properties: { color: { enum: ["red", "blue"] } },
      };
      const current = {
        type: "object",
        properties: { color: { enum: ["blue", "green"] } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(1);
      expect(result.breaking[0]).toContain("removed: red");
      expect(result.nonBreaking).toHaveLength(1);
      expect(result.nonBreaking[0]).toContain("added: green");
    });

    it("reports no change for identical enum values", () => {
      const baseline = {
        type: "object",
        properties: { status: { enum: ["a", "b"] } },
      };
      const current = {
        type: "object",
        properties: { status: { enum: ["a", "b"] } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(0);
      expect(result.nonBreaking).toHaveLength(0);
    });
  });

  describe("nullable changes", () => {
    it("detects nullable removal as breaking", () => {
      const baseline = {
        type: "object",
        properties: { name: { type: "string", nullable: true } },
      };
      const current = {
        type: "object",
        properties: { name: { type: "string" } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(1);
      expect(result.breaking[0]).toContain("no longer nullable");
    });

    it("detects nullable addition as non-breaking", () => {
      const baseline = {
        type: "object",
        properties: { name: { type: "string" } },
      };
      const current = {
        type: "object",
        properties: { name: { type: "string", nullable: true } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.nonBreaking).toHaveLength(1);
      expect(result.nonBreaking[0]).toContain("became nullable");
    });

    it("reports no change when nullable stays true", () => {
      const baseline = {
        type: "object",
        properties: { name: { type: "string", nullable: true } },
      };
      const current = {
        type: "object",
        properties: { name: { type: "string", nullable: true } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(0);
      expect(result.nonBreaking).toHaveLength(0);
    });
  });

  describe("cosmetic changes", () => {
    it("detects description change as non-breaking", () => {
      const baseline = {
        type: "object",
        properties: { id: { type: "string", description: "The unique ID" } },
      };
      const current = {
        type: "object",
        properties: { id: { type: "string", description: "Unique identifier" } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.breaking).toHaveLength(0);
      expect(result.nonBreaking).toHaveLength(1);
      expect(result.nonBreaking[0]).toContain("description changed");
    });

    it("detects example change as non-breaking", () => {
      const baseline = {
        type: "object",
        properties: { name: { type: "string", example: "John" } },
      };
      const current = {
        type: "object",
        properties: { name: { type: "string", example: "Jane" } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.nonBreaking).toHaveLength(1);
      expect(result.nonBreaking[0]).toContain("example changed");
    });

    it("detects examples (plural) change as non-breaking", () => {
      const baseline = {
        type: "object",
        properties: { tag: { type: "string", examples: ["a", "b"] } },
      };
      const current = {
        type: "object",
        properties: { tag: { type: "string", examples: ["x", "y", "z"] } },
      };
      const result = compareSchema("Test", baseline, current);
      expect(result.nonBreaking).toHaveLength(1);
      expect(result.nonBreaking[0]).toContain("examples changed");
    });
  });

  describe("complex multi-change scenarios", () => {
    it("handles combined breaking and non-breaking changes", () => {
      const baseline = {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", description: "old" },
          legacy: { type: "number" },
        },
        required: ["id"],
      };
      const current = {
        type: "object",
        properties: {
          id: { type: "number" }, // type change (breaking)
          name: { type: "string", description: "new" }, // cosmetic (non-breaking)
          // legacy removed (breaking)
          newField: { type: "boolean" }, // new optional (non-breaking)
        },
        required: ["id"],
      };
      const result = compareSchema("Complex", baseline, current);
      expect(result.breaking.length).toBeGreaterThanOrEqual(2); // type change + removal
      expect(result.nonBreaking.length).toBeGreaterThanOrEqual(2); // description + new field
    });

    it("schema ID is included in messages", () => {
      const baseline = {
        type: "object",
        properties: { x: { type: "string" } },
      };
      const current = {
        type: "object",
        properties: {},
      };
      const result = compareSchema("UserProfile", baseline, current);
      expect(result.breaking[0]).toContain("UserProfile");
    });
  });
});
