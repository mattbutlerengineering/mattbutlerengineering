import { describe, it, expect } from "vitest";
import { parseProblemDetails } from "./problem-details.js";
import type { ProblemDetails } from "@mbe/types";

describe("parseProblemDetails", () => {
  it("parses a well-formed RFC 7807 body", () => {
    const raw: ProblemDetails = {
      type: "https://example.com/errors/not-found",
      title: "Resource Not Found",
      status: 404,
      detail: "The guest with id 'g1' does not exist.",
      instance: "/api/v1/guests/g1",
    };

    const result = parseProblemDetails(raw, 404);

    expect(result.type).toBe("https://example.com/errors/not-found");
    expect(result.title).toBe("Resource Not Found");
    expect(result.status).toBe(404);
    expect(result.detail).toBe("The guest with id 'g1' does not exist.");
    expect(result.instance).toBe("/api/v1/guests/g1");
  });

  it("degrades gracefully for a malformed / partial body", () => {
    // Body that looks like problem+json but is missing required fields
    const malformed = { type: "about:blank", oops: true };

    const result = parseProblemDetails(malformed, 500);

    expect(result.status).toBe(500);
    expect(result.type).toBe("about:blank");
    expect(typeof result.title).toBe("string");
    expect(typeof result.detail).toBe("string");
  });

  it("falls back gracefully for a non-7807 body (plain text / HTML 500)", () => {
    // plain text string — not even an object
    const result = parseProblemDetails("Bad Gateway", 502);

    expect(result.status).toBe(502);
    expect(result.type).toBe("about:blank");
    expect(typeof result.title).toBe("string");
    expect(typeof result.detail).toBe("string");
    // Must not throw
  });
});
