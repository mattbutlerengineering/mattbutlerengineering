import { describe, it, expect } from "vitest";
import { parseListQuery, createListResponseSchema } from "./list-utils.js";

describe("parseListQuery", () => {
  it("returns defaults when no query params provided", () => {
    expect(parseListQuery({})).toEqual({ page: 1, limit: 10 });
  });

  it("parses valid page and limit", () => {
    expect(parseListQuery({ page: "3", limit: "25" })).toEqual({ page: 3, limit: 25 });
  });

  it("defaults page to 1 for page=0", () => {
    expect(parseListQuery({ page: "0" })).toEqual({ page: 1, limit: 10 });
  });

  it("defaults page to 1 for negative page", () => {
    expect(parseListQuery({ page: "-5" })).toEqual({ page: 1, limit: 10 });
  });

  it("caps limit at 100", () => {
    expect(parseListQuery({ limit: "200" })).toEqual({ page: 1, limit: 100 });
  });

  it("defaults limit to 10 for NaN", () => {
    expect(parseListQuery({ page: "abc", limit: "xyz" })).toEqual({ page: 1, limit: 10 });
  });

  it("defaults limit to 1 for negative limit", () => {
    expect(parseListQuery({ limit: "-5" })).toEqual({ page: 1, limit: 1 });
  });

  it("handles page=1 explicitly", () => {
    expect(parseListQuery({ page: "1", limit: "10" })).toEqual({ page: 1, limit: 10 });
  });

  it("handles limit=100 at boundary", () => {
    expect(parseListQuery({ limit: "100" })).toEqual({ page: 1, limit: 100 });
  });

  it("handles limit=1 at minimum", () => {
    expect(parseListQuery({ limit: "1" })).toEqual({ page: 1, limit: 1 });
  });
});

describe("createListResponseSchema", () => {
  it("returns a schema with data array and pagination", () => {
    const schema = createListResponseSchema("User#");
    expect(schema).toEqual({
      type: "object",
      properties: {
        data: { type: "array", items: { $ref: "User#" } },
        pagination: {
          type: "object",
          properties: {
            page: { type: "number" },
            limit: { type: "number" },
            total: { type: "number" },
          },
        },
      },
    });
  });

  it("uses the provided entity ref", () => {
    const schema = createListResponseSchema("Reservation#");
    expect(schema.properties.data.items).toEqual({ $ref: "Reservation#" });
  });
});
