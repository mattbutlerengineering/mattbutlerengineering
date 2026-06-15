import { describe, it, expect } from "vitest";
import { classifyError } from "./classify-error.js";

interface TestError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
  meta?: Record<string, unknown>;
  validation?: Array<{
    keyword: string;
    instancePath?: string;
    dataPath?: string;
    schemaPath?: string;
    params?: Record<string, unknown>;
    message?: string;
  }>;
  details?: Record<string, unknown>;
}

describe("classifyError", () => {
  it("classifies a generic 500 error", () => {
    const err = new Error("Something blew up");
    const result = classifyError(err);
    expect(result).toEqual({
      status: 500,
      title: "Internal Server Error",
      detail: "Something blew up",
      extensions: {},
    });
  });

  it("classifies a custom statusCode HTTP error", () => {
    const err = new Error("Custom not found") as TestError;
    err.statusCode = 404;
    const result = classifyError(err);
    expect(result).toEqual({
      status: 404,
      title: "Not Found",
      detail: "Custom not found",
      extensions: {},
    });
  });

  it("classifies a custom HTTP error with details", () => {
    const err = new Error("Bad request") as TestError;
    err.statusCode = 400;
    err.details = { field: "name" };
    const result = classifyError(err);
    expect(result).toEqual({
      status: 400,
      title: "Bad Request",
      detail: "Bad request",
      extensions: { details: { field: "name" } },
    });
  });

  it("classifies an AJV validation error", () => {
    const err = new Error("validation error") as TestError;
    err.validation = [
      {
        keyword: "required",
        params: { missingProperty: "name" },
        message: "must have required property 'name'",
      },
    ];
    const result = classifyError(err);
    expect(result.status).toBe(400);
    expect(result.title).toBe("Bad Request");
    expect(result.detail).toContain("Validation failed");
    expect(result.extensions).toMatchObject({ details: { validation: err.validation } });
  });

  it("classifies a Prisma P2025 (record not found) error", () => {
    const err = new Error("An error occurred") as TestError;
    err.name = "PrismaClientKnownRequestError";
    err.code = "P2025";
    err.meta = { cause: "Venue not found" };
    const result = classifyError(err);
    expect(result).toEqual({
      status: 404,
      title: "Not Found",
      detail: "Venue not found",
      extensions: { prismaCode: "P2025", prismaMeta: { cause: "Venue not found" } },
    });
  });

  it("classifies a Prisma P2002 (unique constraint) error", () => {
    const err = new Error("An error occurred") as TestError;
    err.name = "PrismaClientKnownRequestError";
    err.code = "P2002";
    err.meta = { target: ["name", "slug"] };
    const result = classifyError(err);
    expect(result).toEqual({
      status: 409,
      title: "Conflict",
      detail: "Unique constraint failed: name, slug",
      extensions: { prismaCode: "P2002", prismaMeta: { target: ["name", "slug"] } },
    });
  });

  it("classifies a Prisma P2003 (foreign key constraint) error", () => {
    const err = new Error("An error occurred") as TestError;
    err.name = "PrismaClientKnownRequestError";
    err.code = "P2003";
    err.meta = { field_name: "venueId" };
    const result = classifyError(err);
    expect(result).toEqual({
      status: 409,
      title: "Conflict",
      detail: "Foreign key constraint failed on field: venueId",
      extensions: { prismaCode: "P2003", prismaMeta: { field_name: "venueId" } },
    });
  });

  it("classifies other Prisma errors as 500 database error", () => {
    const err = new Error("DB error") as TestError;
    err.name = "PrismaClientKnownRequestError";
    err.code = "P1001";
    const result = classifyError(err);
    expect(result).toEqual({
      status: 500,
      title: "Database Error",
      detail: "A database error occurred",
      extensions: { prismaCode: "P1001" },
    });
  });

  it("detects Prisma errors by constructor name", () => {
    const err = new Error("DB error") as TestError;
    Object.defineProperty(err, "constructor", { value: { name: "PrismaClientKnownRequestError" } });
    err.code = "P2025";
    const result = classifyError(err);
    expect(result.status).toBe(404);
  });

  it("detects Prisma errors by P2 code prefix", () => {
    const err = new Error("DB error") as TestError;
    err.code = "P2999";
    const result = classifyError(err);
    expect(result.status).toBe(500);
    expect(result.title).toBe("Database Error");
  });
});
