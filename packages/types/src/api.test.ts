import { describe, it, expect } from "vitest";
import type { ProblemDetails, ApiError } from "./api.js";
import { createProblemDetails, titleForStatus } from "./api.js";
import { ProblemDetailsSchema, ApiErrorSchema } from "./schemas/api.js";

describe("createProblemDetails", () => {
  it("creates a valid problem details object with defaults", () => {
    const result = createProblemDetails(404, "Not Found", "The resource was not found");
    expect(result).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "The resource was not found",
      instance: undefined,
      error: "Not Found",
      message: "The resource was not found",
      statusCode: 404,
    });
  });

  it("creates problem details with custom type and instance", () => {
    const result = createProblemDetails(
      422,
      "Validation Error",
      "partySize must be positive",
      "https://api.example.com/errors/validation",
      "/reservations/123"
    );
    expect(result.type).toBe("https://api.example.com/errors/validation");
    expect(result.instance).toBe("/reservations/123");
    expect(result.status).toBe(422);
    expect(result.statusCode).toBe(422);
  });

  it("merges extensions into the returned object", () => {
    const result = createProblemDetails(
      400,
      "Bad Request",
      "Invalid input",
      "about:blank",
      undefined,
      { fieldErrors: [{ field: "email", message: "required" }], traceId: "abc-123" }
    );
    expect(result.fieldErrors).toEqual([{ field: "email", message: "required" }]);
    expect(result.traceId).toBe("abc-123");
  });

  it("maintains backward compatibility (has both error/message and title/detail)", () => {
    const result = createProblemDetails(500, "Internal Error", "Something broke");
    // RFC 7807 fields
    expect(result.title).toBe("Internal Error");
    expect(result.detail).toBe("Something broke");
    expect(result.status).toBe(500);
    // Legacy fields
    expect(result.error).toBe("Internal Error");
    expect(result.message).toBe("Something broke");
    expect(result.statusCode).toBe(500);
  });

  it("uses about:blank as default type", () => {
    const result = createProblemDetails(503, "Service Unavailable", "Try again later");
    expect(result.type).toBe("about:blank");
  });
});

describe("titleForStatus", () => {
  it("maps 500 to the canonical RFC reason phrase (resolves producer/consumer drift)", () => {
    expect(titleForStatus(500)).toBe("Internal Server Error");
  });

  it("maps known 4xx/5xx statuses to their canonical RFC reason phrase", () => {
    expect(titleForStatus(400)).toBe("Bad Request");
    expect(titleForStatus(401)).toBe("Unauthorized");
    expect(titleForStatus(403)).toBe("Forbidden");
    expect(titleForStatus(404)).toBe("Not Found");
    expect(titleForStatus(405)).toBe("Method Not Allowed");
    expect(titleForStatus(406)).toBe("Not Acceptable");
    expect(titleForStatus(408)).toBe("Request Timeout");
    expect(titleForStatus(409)).toBe("Conflict");
    expect(titleForStatus(410)).toBe("Gone");
    expect(titleForStatus(415)).toBe("Unsupported Media Type");
    expect(titleForStatus(422)).toBe("Unprocessable Entity");
    expect(titleForStatus(429)).toBe("Too Many Requests");
    expect(titleForStatus(503)).toBe("Service Unavailable");
  });

  it("falls back to a generic server-error title for unlisted 5xx statuses", () => {
    expect(titleForStatus(502)).toBe("Internal Server Error");
    expect(titleForStatus(504)).toBe("Internal Server Error");
  });

  it("falls back to a generic 'Error' title for unlisted non-5xx statuses", () => {
    expect(titleForStatus(402)).toBe("Error");
    expect(titleForStatus(200)).toBe("Error");
  });
});

describe("schema/type alignment (drift prevention)", () => {
  it("ProblemDetails output parses successfully against ProblemDetailsSchema", () => {
    // If ProblemDetails type and ProblemDetailsSchema drift, one of these will fail
    const problem = createProblemDetails(422, "Validation Error", "partySize must be > 0");
    const result = ProblemDetailsSchema.safeParse(problem);
    expect(result.success).toBe(true);
  });

  it("ApiErrorSchema validates the legacy error shape produced by the client fallback", () => {
    // The api-client's error fallback object must match ApiErrorSchema
    const legacyError: ApiError = {
      error: "Error",
      message: "Not Found",
      statusCode: 404,
    };
    const result = ApiErrorSchema.safeParse(legacyError);
    expect(result.success).toBe(true);
  });

  it("ProblemDetails and ApiError are z.infer-derived (compile-time enforcement via assignment)", () => {
    // These assignments compile only if ProblemDetails === z.infer<typeof ProblemDetailsSchema>
    // and ApiError === z.infer<typeof ApiErrorSchema>. If the types diverge the
    // typecheck gate will catch it here before CI runs.
    const problemData: ProblemDetails = {
      type: "about:blank",
      title: "Test",
      status: 200,
      detail: "ok",
    };
    const errorData: ApiError = {
      error: "NotFound",
      message: "Resource missing",
      statusCode: 404,
    };
    expect(ProblemDetailsSchema.safeParse(problemData).success).toBe(true);
    expect(ApiErrorSchema.safeParse(errorData).success).toBe(true);
  });
});
