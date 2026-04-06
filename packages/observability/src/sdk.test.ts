import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import { shouldIgnoreRequest } from "./sdk.js";

function fakeRequest(url: string): IncomingMessage {
  return { url } as IncomingMessage;
}

describe("shouldIgnoreRequest", () => {
  it("ignores /health", () => {
    expect(shouldIgnoreRequest(fakeRequest("/health"))).toBe(true);
  });

  it("ignores /health sub-paths", () => {
    expect(shouldIgnoreRequest(fakeRequest("/health/ready"))).toBe(true);
  });

  it("ignores /docs", () => {
    expect(shouldIgnoreRequest(fakeRequest("/docs"))).toBe(true);
  });

  it("ignores /docs sub-paths (Swagger assets)", () => {
    expect(shouldIgnoreRequest(fakeRequest("/docs/json"))).toBe(true);
    expect(shouldIgnoreRequest(fakeRequest("/docs/static/index.html"))).toBe(
      true,
    );
  });

  it("ignores /reference", () => {
    expect(shouldIgnoreRequest(fakeRequest("/reference"))).toBe(true);
  });

  it("ignores /reference sub-paths (Scalar assets)", () => {
    expect(shouldIgnoreRequest(fakeRequest("/reference/theme.css"))).toBe(true);
  });

  it("does not ignore application routes", () => {
    expect(shouldIgnoreRequest(fakeRequest("/api/v1/reservations"))).toBe(
      false,
    );
    expect(shouldIgnoreRequest(fakeRequest("/api/v1/tables"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/"))).toBe(false);
  });

  it("does not ignore routes that only contain ignored prefixes as substrings", () => {
    expect(shouldIgnoreRequest(fakeRequest("/api/v1/docs-upload"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/api/reference-data"))).toBe(false);
    expect(shouldIgnoreRequest(fakeRequest("/healthy"))).toBe(false);
  });

  it("handles missing url gracefully", () => {
    expect(shouldIgnoreRequest({ url: undefined } as IncomingMessage)).toBe(
      false,
    );
  });
});
