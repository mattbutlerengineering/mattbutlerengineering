import { describe, expect, it } from "vitest";
import { materializeCatalogProps } from "./materialize-table-data.js";

const columns = [
  { key: "name", header: "Name" },
  { key: "email", header: "Email" },
  { key: "status", header: "Status" },
];

describe("materializeCatalogProps", () => {
  it("replaces a $state binding with sample rows derived from the columns", () => {
    const next = materializeCatalogProps("Table", {
      columns,
      data: { $state: "/users" },
      emptyMessage: "No users found",
    }) as { data: Record<string, string>[] };

    expect(next.data).toHaveLength(8);
    expect(next.data[0]).toEqual({
      name: "Alex Rivera",
      email: "user1@example.com",
      status: "Active",
    });
    expect(next.data[1]?.status).toBe("Invited");
  });

  it("leaves a real array, including an empty one, untouched", () => {
    const empty = { columns, data: [] as unknown[] };
    expect(materializeCatalogProps("DataTable", empty)).toBe(empty);
    const rows = { columns, data: [{ name: "Ada" }] };
    expect(materializeCatalogProps("Table", rows)).toBe(rows);
  });

  it("does not invent rows for other components or for a table with no columns", () => {
    const text = { children: "Hello" };
    expect(materializeCatalogProps("Text", text)).toBe(text);
    const noColumns = { data: { $state: "/users" } };
    expect(materializeCatalogProps("Table", noColumns)).toBe(noColumns);
  });
});
