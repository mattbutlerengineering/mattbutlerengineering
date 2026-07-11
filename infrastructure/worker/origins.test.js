/**
 * Tests for the shared CORS origin allowlist module.
 *
 * corsOriginFor is the single owner of the Access-Control-Allow-Origin
 * decision for every health handler; this exercises it directly.
 */

import { describe, it, expect } from "vitest";
import { ALLOWED_ORIGINS, corsOriginFor } from "./origins.js";

describe("origins", () => {
  it("exposes the production allowlist as a Set", () => {
    expect(ALLOWED_ORIGINS).toBeInstanceOf(Set);
    expect(ALLOWED_ORIGINS.has("https://mattbutlerengineering.com")).toBe(true);
    expect(ALLOWED_ORIGINS.has("https://hospitality.mattbutlerengineering.com")).toBe(true);
    expect(ALLOWED_ORIGINS.has("https://gen.mattbutlerengineering.com")).toBe(true);
  });

  describe("corsOriginFor", () => {
    it("returns the Origin when it is allowlisted", () => {
      const request = new Request("https://example.com/health", {
        headers: { Origin: "https://mattbutlerengineering.com" },
      });
      expect(corsOriginFor(request)).toBe("https://mattbutlerengineering.com");
    });

    it("returns null for a disallowed Origin", () => {
      const request = new Request("https://example.com/health", {
        headers: { Origin: "https://evil.example.com" },
      });
      expect(corsOriginFor(request)).toBeNull();
    });

    it("returns null when no Origin header is present", () => {
      const request = new Request("https://example.com/health");
      expect(corsOriginFor(request)).toBeNull();
    });
  });
});
