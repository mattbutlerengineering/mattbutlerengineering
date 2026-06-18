import { describe, it, expect } from "vitest";
import {
  parseListQuery,
  createListResponseSchema,
  paginate,
  toPaginationMeta,
  buildPaginatedResponse,
} from "./list-utils.js";

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

describe("paginate", () => {
  it("returns skip=0 and take=limit for page 1", () => {
    expect(paginate({ page: 1, limit: 10 })).toEqual({ skip: 0, take: 10 });
  });

  it("returns correct skip for page 2", () => {
    expect(paginate({ page: 2, limit: 10 })).toEqual({ skip: 10, take: 10 });
  });

  it("returns correct skip for last page", () => {
    expect(paginate({ page: 5, limit: 20 })).toEqual({ skip: 80, take: 20 });
  });

  it("returns skip=0 for page 1 with any limit", () => {
    expect(paginate({ page: 1, limit: 50 })).toEqual({ skip: 0, take: 50 });
  });

  it("handles over-range page (still computes skip correctly)", () => {
    expect(paginate({ page: 100, limit: 10 })).toEqual({ skip: 990, take: 10 });
  });
});

describe("toPaginationMeta", () => {
  it("returns correct meta for page 1 of many", () => {
    expect(toPaginationMeta(1, 10, 25)).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
      hasPrev: false,
    });
  });

  it("returns correct meta for last page", () => {
    expect(toPaginationMeta(3, 10, 25)).toEqual({
      page: 3,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNext: false,
      hasPrev: true,
    });
  });

  it("returns correct meta for empty result set", () => {
    expect(toPaginationMeta(1, 10, 0)).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });

  it("returns correct meta for single page", () => {
    expect(toPaginationMeta(1, 10, 5)).toEqual({
      page: 1,
      limit: 10,
      total: 5,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  });

  it("returns correct meta for middle page", () => {
    expect(toPaginationMeta(2, 5, 11)).toEqual({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it("returns correct meta for over-range page", () => {
    expect(toPaginationMeta(10, 10, 5)).toEqual({
      page: 10,
      limit: 10,
      total: 5,
      totalPages: 1,
      hasNext: false,
      hasPrev: true,
    });
  });
});

describe("buildPaginatedResponse", () => {
  it("returns data and pagination for a standard page", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = buildPaginatedResponse(items, 1, 10, 25);
    expect(result).toEqual({
      data: items,
      pagination: {
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      },
    });
  });

  it("returns correct pagination for page 1", () => {
    const result = buildPaginatedResponse(["x"], 1, 5, 5);
    expect(result.pagination.hasPrev).toBe(false);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.totalPages).toBe(1);
  });

  it("returns correct pagination for last page", () => {
    const result = buildPaginatedResponse(["x"], 3, 10, 25);
    expect(result.pagination.hasPrev).toBe(true);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.totalPages).toBe(3);
  });

  it("returns correct pagination for empty result set", () => {
    const result = buildPaginatedResponse([], 1, 10, 0);
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it("preserves generic data type", () => {
    type Item = { id: number; name: string };
    const items: Item[] = [{ id: 1, name: "Alice" }];
    const result = buildPaginatedResponse(items, 1, 10, 1);
    expect(result.data[0].name).toBe("Alice");
  });
});

describe("createListResponseSchema", () => {
  it("returns a schema with data array and all six pagination fields", () => {
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
            totalPages: { type: "number" },
            hasNext: { type: "boolean" },
            hasPrev: { type: "boolean" },
          },
        },
      },
    });
  });

  it("uses the provided entity ref", () => {
    const schema = createListResponseSchema("Reservation#");
    expect(schema.properties.data.items).toEqual({ $ref: "Reservation#" });
  });

  it("schema pagination fields match the six fields toPaginationMeta returns", () => {
    const schema = createListResponseSchema("User#");
    const paginationProps = schema.properties.pagination.properties;
    const runtimeMeta = toPaginationMeta(1, 10, 0);
    const runtimeKeys = Object.keys(runtimeMeta).sort();
    const schemaKeys = Object.keys(paginationProps).sort();
    expect(schemaKeys).toEqual(runtimeKeys);
  });
});
