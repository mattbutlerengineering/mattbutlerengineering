import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { dbListTables, dbMigrationStatus } from "./database.js";

describe("dbListTables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DATABASE_URL"];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env["DATABASE_URL"];
  });

  it("returns error JSON when DATABASE_URL is not set", async () => {
    const result = await dbListTables();
    const parsed = JSON.parse(result) as { error: string };

    expect(parsed.error).toBe("DATABASE_URL not set");
    expect(vi.mocked(execSync)).not.toHaveBeenCalled();
  });

  it("returns tables list when query succeeds", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.mocked(execSync).mockReturnValue("users\norders\nproducts\n");

    const result = await dbListTables();
    const parsed = JSON.parse(result) as { tables: string[] };

    expect(Array.isArray(parsed.tables)).toBe(true);
    expect(parsed.tables).toContain("users");
    expect(parsed.tables).toContain("orders");
    expect(parsed.tables).toContain("products");
  });

  it("filters empty lines from psql output", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.mocked(execSync).mockReturnValue("users\n\norders\n\n");

    const result = await dbListTables();
    const parsed = JSON.parse(result) as { tables: string[] };

    expect(parsed.tables).not.toContain("");
    expect(parsed.tables).toHaveLength(2);
  });

  it("returns error JSON when psql command fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("psql: connection refused");
    });

    const result = await dbListTables();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to list tables");
    expect(parsed.message).toBe("psql: connection refused");
  });

  it("result is a valid MCP text content string", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.mocked(execSync).mockReturnValue(" users\n");

    const result = await dbListTables();
    const mcpContent = [{ type: "text" as const, text: result }];

    expect(mcpContent[0].type).toBe("text");
    expect(typeof mcpContent[0].text).toBe("string");
  });
});

describe("dbMigrationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["DATABASE_URL"];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env["DATABASE_URL"];
  });

  it("returns error JSON when DATABASE_URL is not set", async () => {
    const result = await dbMigrationStatus();
    const parsed = JSON.parse(result) as { error: string };

    expect(parsed.error).toBe("DATABASE_URL not set");
    expect(vi.mocked(execSync)).not.toHaveBeenCalled();
  });

  it("returns migrations list when query succeeds", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.mocked(execSync).mockReturnValue(
      " 20240101_initial | 2024-01-01 00:00:00\n 20240201_users | 2024-02-01 00:00:00\n"
    );

    const result = await dbMigrationStatus();
    const parsed = JSON.parse(result) as { migrations: string[] };

    expect(Array.isArray(parsed.migrations)).toBe(true);
    expect(parsed.migrations).toHaveLength(2);
  });

  it("filters empty lines from psql output", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.mocked(execSync).mockReturnValue(" 20240101_initial | 2024-01-01\n\n");

    const result = await dbMigrationStatus();
    const parsed = JSON.parse(result) as { migrations: string[] };

    expect(parsed.migrations).not.toContain("");
    expect(parsed.migrations).toHaveLength(1);
  });

  it("returns error JSON when psql command fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("connection error");
    });

    const result = await dbMigrationStatus();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get migration status");
    expect(parsed.message).toBe("connection error");
  });

  it("handles non-Error thrown values", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.mocked(execSync).mockImplementation(() => {
      throw 42;
    });

    const result = await dbMigrationStatus();
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get migration status");
    expect(parsed.message).toBe("42");
  });
});
