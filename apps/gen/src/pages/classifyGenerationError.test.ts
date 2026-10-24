import { describe, it, expect } from "vitest";
import { isTransportError, describeLimitError } from "./classifyGenerationError.js";

describe("isTransportError", () => {
  it("treats an HTTP non-2xx failure as transport (streamNDJSON's 'Request failed:' prefix)", () => {
    expect(isTransportError(new Error("Request failed: Unauthorized"))).toBe(true);
    expect(isTransportError(new Error("Request failed: Not Found"))).toBe(true);
  });

  it("treats an unreadable response body as transport", () => {
    expect(isTransportError(new Error("Response body is not readable"))).toBe(true);
  });

  it("treats a raw fetch() network failure (TypeError) as transport", () => {
    expect(isTransportError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("treats any other error as a generation/validation failure, not transport", () => {
    expect(isTransportError(new Error("Invalid nested layout"))).toBe(false);
    expect(isTransportError(new Error("Unknown component type"))).toBe(false);
  });

  it("treats a status-carrying error as transport regardless of its message", () => {
    const err = Object.assign(new Error("Too many"), { status: 429 });
    expect(isTransportError(err)).toBe(true);
  });
});

describe("describeLimitError", () => {
  const withStatus = (status: number, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error("Request failed: x"), { status, ...extra });

  it("describes a 429 as a per-user rate limit with the retry time in minutes", () => {
    const msg = describeLimitError(withStatus(429, { retryAfterSeconds: 540 }));
    expect(msg).toMatch(/too many requests/i);
    expect(msg).toMatch(/9 minutes/);
  });

  it("rounds a short 429 wait up to a minute", () => {
    expect(describeLimitError(withStatus(429, { retryAfterSeconds: 20 }))).toMatch(/1 minute\b/);
  });

  it("describes the spend-ceiling 503 as a daily budget, distinct from a rate limit", () => {
    const msg = describeLimitError(
      withStatus(503, {
        problemType: "urn:mbe:problem:gen-spend-ceiling-reached",
        retryAfterSeconds: 7200,
      })
    );
    expect(msg).toMatch(/daily budget/i);
    expect(msg).toMatch(/tomorrow/i);
    expect(msg).not.toMatch(/too many requests/i);
  });

  it("describes the ceiling-unavailable 503 as temporarily unavailable", () => {
    const msg = describeLimitError(
      withStatus(503, { problemType: "urn:mbe:problem:gen-spend-ceiling-unavailable" })
    );
    expect(msg).toMatch(/temporarily unavailable/i);
  });

  it("returns null for other failures", () => {
    expect(describeLimitError(withStatus(500))).toBeNull();
    expect(describeLimitError(withStatus(503))).toBeNull();
    expect(describeLimitError(new Error("Request failed: Too Many Requests"))).toBeNull();
  });
});
