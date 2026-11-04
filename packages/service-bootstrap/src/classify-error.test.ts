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
  it("classifies an AppError, preserving its code as an extension", () => {
    // Mirrors @mbe/types AppError without importing it: name "AppError",
    // a machine-readable code, and statusCode aliasing httpStatus.
    const err = new Error("Pacing limit reached for this time slot") as TestError;
    err.name = "AppError";
    err.code = "PACING_EXCEEDED";
    err.statusCode = 422;
    const result = classifyError(err);
    expect(result).toEqual({
      status: 422,
      title: "Unprocessable Entity",
      detail: "Pacing limit reached for this time slot",
      extensions: { code: "PACING_EXCEEDED" },
    });
  });

  it("classifies a generic 500 error without leaking the raw exception message", () => {
    const err = new Error("Something blew up");
    const result = classifyError(err);
    expect(result).toEqual({
      status: 500,
      title: "Internal Server Error",
      detail: "An unexpected error occurred",
      extensions: {},
    });
  });

  it("does not echo an unclassified error's raw message into the response detail (CWE-209)", () => {
    const err = new Error("some internal detail");
    const result = classifyError(err);
    expect(result.detail).not.toBe("some internal detail");
    expect(result.detail).not.toContain("some internal detail");
    expect(result.detail).toBe("An unexpected error occurred");
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

  // #8261: Prisma's `meta` carries constraint names, column names and model
  // names. None of it may reach the client; the error handler logs it.
  it("classifies a Prisma P2025 (record not found) error without leaking meta", () => {
    const err = new Error("Invalid `prisma.table.delete()` invocation") as TestError;
    err.name = "PrismaClientKnownRequestError";
    err.code = "P2025";
    err.meta = { cause: "No record was found for a delete.", modelName: "Table" };
    const result = classifyError(err);
    expect(result).toEqual({
      status: 404,
      title: "Not Found",
      detail: "Record not found",
      extensions: { prismaCode: "P2025" },
    });
  });

  it("classifies a Prisma P2002 (unique constraint) error without leaking fields", () => {
    const err = new Error("An error occurred") as TestError;
    err.name = "PrismaClientKnownRequestError";
    err.code = "P2002";
    err.meta = { target: ["venue_id", "slug"], modelName: "Venue" };
    const result = classifyError(err);
    expect(result).toEqual({
      status: 409,
      title: "Conflict",
      detail: "A record with these details already exists",
      extensions: { prismaCode: "P2002" },
    });
  });

  it("classifies a Prisma P2003 (foreign key constraint) error without leaking the constraint", () => {
    const err = new Error("An error occurred") as TestError;
    err.name = "PrismaClientKnownRequestError";
    err.code = "P2003";
    err.meta = { field_name: "reservations_table_id_fkey (index)", modelName: "Table" };
    const result = classifyError(err);
    expect(result).toEqual({
      status: 409,
      title: "Conflict",
      detail: "This item is still in use by other records",
      extensions: { prismaCode: "P2003" },
    });
    expect(JSON.stringify(result)).not.toContain("fkey");
  });

  it("never attaches prismaMeta for an unmapped Prisma code", () => {
    const err = new Error("DB error") as TestError;
    err.name = "PrismaClientKnownRequestError";
    err.code = "P2034";
    err.meta = { database_host: "db.internal" };
    const result = classifyError(err);
    expect(result.extensions).toEqual({ prismaCode: "P2034" });
    expect(JSON.stringify(result)).not.toContain("db.internal");
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
