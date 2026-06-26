import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { AppError } from "@mbe/types";

/**
 * Unit tests for the AppError Fastify error handler.
 * The handler is registered in buildApp (app.ts) on the full service app.
 * Here we test the serialization logic in isolation via a minimal Fastify instance.
 */

/**
 * Builds a minimal Fastify instance with only the AppError error handler
 * registered, mirroring what buildApp registers in app.ts.
 */
async function buildTestApp() {
  const { getTitleForStatus } = await import("@mbe/service-bootstrap");

  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      const { httpStatus, message } = error;
      return reply.status(httpStatus).send({
        type: `https://httpproblems.com/http-status/${httpStatus}`,
        title: getTitleForStatus(httpStatus),
        status: httpStatus,
        detail: message,
      });
    }
    return reply
      .status(500)
      .send({ type: "about:blank", status: 500, title: "Error", detail: (error as Error).message });
  });

  app.get("/throw-app-error/:status", async (request) => {
    const { status } = request.params as { status: string };
    throw new AppError("TEST_CODE", parseInt(status, 10), `Test error for status ${status}`);
  });

  await app.ready();
  return app;
}

describe("AppError error handler", () => {
  it("serializes AppError(404) to RFC 9457 problem-detail with status 404", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/throw-app-error/404" });
    expect(res.statusCode).toBe(404);

    const body = res.json();
    expect(body).toMatchObject({
      type: "https://httpproblems.com/http-status/404",
      title: "Not Found",
      status: 404,
      detail: "Test error for status 404",
    });

    await app.close();
  });

  it("serializes AppError(409) to RFC 9457 problem-detail with status 409", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/throw-app-error/409" });
    expect(res.statusCode).toBe(409);

    const body = res.json();
    expect(body).toMatchObject({
      type: "https://httpproblems.com/http-status/409",
      title: "Conflict",
      status: 409,
      detail: "Test error for status 409",
    });

    await app.close();
  });

  it("serializes AppError(410) to RFC 9457 problem-detail with status 410", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/throw-app-error/410" });
    expect(res.statusCode).toBe(410);

    const body = res.json();
    expect(body).toMatchObject({
      type: "https://httpproblems.com/http-status/410",
      title: "Gone",
      status: 410,
      detail: "Test error for status 410",
    });

    await app.close();
  });

  it("serializes AppError(422) to RFC 9457 problem-detail with status 422", async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: "GET", url: "/throw-app-error/422" });
    expect(res.statusCode).toBe(422);

    const body = res.json();
    expect(body).toMatchObject({
      type: "https://httpproblems.com/http-status/422",
      title: "Unprocessable Entity",
      status: 422,
      detail: "Test error for status 422",
    });

    await app.close();
  });
});
