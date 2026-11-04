import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "./error-handler.js";

interface TestError extends Error {
  statusCode?: number;
  code?: string;
  meta?: Record<string, unknown>;
}

describe("errorHandlerPlugin", () => {
  const buildApp = async () => {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    return app;
  };

  it("handles custom statusCode errors", async () => {
    const app = await buildApp();
    app.get("/error", async () => {
      const err = new Error("Custom not found") as TestError;
      err.statusCode = 404;
      throw err;
    });

    const res = await app.inject({ method: "GET", url: "/error" });
    expect(res.statusCode).toBe(404);

    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      status: 404,
      title: "Not Found",
      detail: "Custom not found",
      instance: "/error",
    });
  });

  it("handles AJV validation errors", async () => {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);

    app.post(
      "/validate",
      {
        schema: {
          body: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "integer", minimum: 18 },
            },
            required: ["name"],
          },
        },
      },
      async () => {
        return { success: true };
      }
    );

    const res = await app.inject({
      method: "POST",
      url: "/validate",
      body: { age: 10 }, // missing name, age < 18
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.status).toBe(400);
    expect(body.title).toBe("Bad Request");
    expect(body.detail).toContain("Validation failed");
    expect(body.details?.validation).toBeDefined();
    expect(body.details.validation.length).toBeGreaterThan(0);
  });

  it("handles Prisma P2025 error (Record not found)", async () => {
    const app = await buildApp();
    app.get("/prisma-404", async () => {
      const err = new Error("An error occurred") as TestError;
      err.name = "PrismaClientKnownRequestError";
      err.code = "P2025";
      err.meta = { cause: "No record was found for a delete.", modelName: "Venue" };
      throw err;
    });

    const res = await app.inject({ method: "GET", url: "/prisma-404" });
    expect(res.statusCode).toBe(404);

    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      status: 404,
      title: "Not Found",
      detail: "Record not found",
      prismaCode: "P2025",
    });
    expect(body).not.toHaveProperty("prismaMeta");
  });

  it("handles Prisma P2002 error (Unique constraint failed)", async () => {
    const app = await buildApp();
    app.get("/prisma-409-unique", async () => {
      const err = new Error("An error occurred") as TestError;
      err.name = "PrismaClientKnownRequestError";
      err.code = "P2002";
      err.meta = { target: ["name", "slug"] };
      throw err;
    });

    const res = await app.inject({ method: "GET", url: "/prisma-409-unique" });
    expect(res.statusCode).toBe(409);

    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      status: 409,
      title: "Conflict",
      detail: "A record with these details already exists",
      prismaCode: "P2002",
    });
    expect(body).not.toHaveProperty("prismaMeta");
  });

  it("handles Prisma P2003 error (Foreign key constraint failed)", async () => {
    const app = await buildApp();
    app.get("/prisma-409-foreign", async () => {
      const err = new Error("An error occurred") as TestError;
      err.name = "PrismaClientKnownRequestError";
      err.code = "P2003";
      err.meta = { field_name: "reservations_table_id_fkey (index)" };
      throw err;
    });

    const res = await app.inject({ method: "GET", url: "/prisma-409-foreign" });
    expect(res.statusCode).toBe(409);

    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      status: 409,
      title: "Conflict",
      detail: "This item is still in use by other records",
      prismaCode: "P2003",
    });
    expect(body).not.toHaveProperty("prismaMeta");
    expect(res.body).not.toContain("fkey");
  });

  it("keeps the full Prisma meta in the server log", async () => {
    const lines: string[] = [];
    const app = Fastify({
      logger: { level: "error", stream: { write: (line: string) => lines.push(line) } },
    });
    await app.register(errorHandlerPlugin);
    app.get("/prisma-409-logged", async () => {
      const err = new Error("An error occurred") as TestError;
      err.name = "PrismaClientKnownRequestError";
      err.code = "P2003";
      err.meta = { field_name: "reservations_table_id_fkey (index)" };
      throw err;
    });

    await app.inject({ method: "GET", url: "/prisma-409-logged" });

    const logged = lines.map((l) => JSON.parse(l) as { err?: { meta?: unknown } });
    expect(
      logged.some((l) => JSON.stringify(l.err?.meta).includes("reservations_table_id_fkey"))
    ).toBe(true);
  });

  it("handles other uncaught errors as 500 without leaking the raw exception message", async () => {
    const app = await buildApp();
    app.get("/uncaught", async () => {
      throw new Error("Something blew up");
    });

    const res = await app.inject({ method: "GET", url: "/uncaught" });
    expect(res.statusCode).toBe(500);

    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      status: 500,
      title: "Internal Server Error",
      detail: "An unexpected error occurred",
    });
  });
});
