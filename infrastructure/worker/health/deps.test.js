/**
 * Tests for the health/deps handler.
 */

import { describe, it, expect } from "vitest";
import { handleHealthDeps } from "./deps.js";

describe("handleHealthDeps", () => {
  it("returns 200 with JSON content type", async () => {
    const request = new Request("https://example.com/health/deps");
    const response = handleHealthDeps(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("returns dep graph with nodes and edges arrays", async () => {
    const request = new Request("https://example.com/health/deps");
    const response = handleHealthDeps(request);
    const body = await response.json();
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  it("sets 5-minute cache control", () => {
    const request = new Request("https://example.com/health/deps");
    const response = handleHealthDeps(request);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("omits CORS header when no Origin is sent", () => {
    const request = new Request("https://example.com/health/deps");
    const response = handleHealthDeps(request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns CORS header for allowed origin", () => {
    const request = new Request("https://example.com/health/deps", {
      headers: { Origin: "https://mattbutlerengineering.com" },
    });
    const response = handleHealthDeps(request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://mattbutlerengineering.com"
    );
  });

  it("omits CORS header for disallowed origin", () => {
    const request = new Request("https://example.com/health/deps", {
      headers: { Origin: "https://evil.example.com" },
    });
    const response = handleHealthDeps(request);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
