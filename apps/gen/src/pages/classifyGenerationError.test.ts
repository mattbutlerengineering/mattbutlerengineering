import { describe, it, expect } from "vitest";
import { isTransportError } from "./classifyGenerationError.js";

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
});
