import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from "fs";
import { createPrismaConfig } from "./prisma-config.js";

const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

describe("createPrismaConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses DATABASE_URL from process.env when set and no .env file present", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });
    process.env.DATABASE_URL = "postgresql://real:real@db.example.com:5432/prod";

    const config = createPrismaConfig();

    expect(config.schema).toBe("prisma/schema.prisma");
    expect(config.datasource?.url).toBe("postgresql://real:real@db.example.com:5432/prod");
  });

  it("falls back to a placeholder URL when no DATABASE_URL and no .env file", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const config = createPrismaConfig();

    expect(config.datasource?.url).toBe(
      "postgresql://placeholder:placeholder@localhost:5432/placeholder"
    );
  });

  it("loads DATABASE_URL from a .env file when process.env does not already set it", () => {
    mockReadFileSync.mockReturnValue('DATABASE_URL="postgresql://from-env-file@localhost/db"\n');

    const config = createPrismaConfig();

    expect(config.datasource?.url).toBe("postgresql://from-env-file@localhost/db");
  });

  it("prefers an existing process.env value over the .env file value", () => {
    mockReadFileSync.mockReturnValue("DATABASE_URL=postgresql://from-env-file@localhost/db\n");
    process.env.DATABASE_URL = "postgresql://from-process-env@localhost/db";

    const config = createPrismaConfig();

    expect(config.datasource?.url).toBe("postgresql://from-process-env@localhost/db");
  });

  it("skips blank lines and comments in the .env file", () => {
    mockReadFileSync.mockReturnValue(
      ["# a comment", "", "  ", "DATABASE_URL=postgresql://parsed@localhost/db"].join("\n")
    );

    const config = createPrismaConfig();

    expect(config.datasource?.url).toBe("postgresql://parsed@localhost/db");
  });
});
