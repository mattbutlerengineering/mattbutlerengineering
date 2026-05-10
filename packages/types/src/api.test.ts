import { describe, it, expect } from "vitest";
import { createProblemDetails } from "./api.js";

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
