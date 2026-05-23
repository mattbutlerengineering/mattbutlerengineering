import { describe, it, expect } from "vitest";
import { parseListQuery, createListResponseSchema } from "./list-utils.js";

describe("parseListQuery", () => {
  it("returns defaults when no params provided", () => {
    const result = parseListQuery({});
    expect(result).toEqual({ page: 1, limit: 10 });
  });

  it("parses valid page and limit", () => {
    const result = parseListQuery({ page: "3", limit: "25" });
    expect(result).toEqual({ page: 3, limit: 25 });
  });

  it("floors page to minimum 1 when page is 0", () => {
    const result = parseListQuery({ page: "0", limit: "10" });
    expect(result.page).toBe(1);
  });

  it("floors page to minimum 1 when page is negative", () => {
    const result = parseListQuery({ page: "-5", limit: "10" });
    expect(result.page).toBe(1);
  });

  it("caps limit to maximum 100", () => {
    const result = parseListQuery({ page: "1", limit: "200" });
    expect(result.limit).toBe(100);
  });

  it("handles NaN page with default", () => {
    const result = parseListQuery({ page: "abc", limit: "10" });
    expect(result.page).toBe(1);
  });

  it("handles NaN limit with default", () => {
    const result = parseListQuery({ page: "1", limit: "xyz" });
    expect(result.limit).toBe(10);
  });

  it("handles zero limit with minimum 1", () => {
    const result = parseListQuery({ page: "1", limit: "0" });
    expect(result.limit).toBe(1);
  });

  it("handles negative limit with minimum 1", () => {
    const result = parseListQuery({ page: "1", limit: "-10" });
    expect(result.limit).toBe(1);
  });

  it("handles limit exactly at maximum 100", () => {
    const result = parseListQuery({ page: "1", limit: "100" });
    expect(result.limit).toBe(100);
  });

  it("handles string values at boundary page=1", () => {
    const result = parseListQuery({ page: "1", limit: "1" });
    expect(result).toEqual({ page: 1, limit: 1 });
  });
});

describe("createListResponseSchema", () => {
  it("generates schema with correct data array type", () => {
    const schema = createListResponseSchema("User#");
    expect(schema.properties.data).toEqual({
      type: "array",
      items: { $ref: "User#" },
    });
  });

  it("includes pagination metadata ref", () => {
    const schema = createListResponseSchema("Venue#");
    expect(schema.properties.pagination).toEqual({ $ref: "Pagination#" });
  });

  it("uses provided entity $ref", () => {
    const schema = createListResponseSchema("Reservation#");
    expect(schema.properties.data.items).toEqual({ $ref: "Reservation#" });
  });

  it("returns object type at the top level", () => {
    const schema = createListResponseSchema("Session#");
    expect(schema.type).toBe("object");
  });

  it("works with different entity refs", () => {
    const guestSchema = createListResponseSchema("Guest#");
    const tableSchema = createListResponseSchema("Table#");
    expect(guestSchema.properties.data.items).toEqual({ $ref: "Guest#" });
    expect(tableSchema.properties.data.items).toEqual({ $ref: "Table#" });
  });
});
