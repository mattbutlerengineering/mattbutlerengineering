import { describe, it, expect, vi, beforeEach } from "vitest";

// The default verifier is the ONLY code that touches jose directly, so it is the
// only place that legitimately mocks the module. Every other verification branch
// is tested through the injected `verifier` seam in plugin.test.ts.
const mockJwtVerify = vi.hoisted(() => vi.fn());
const mockCreateRemoteJWKSet = vi.hoisted(() => vi.fn(() => "mock-jwks"));

vi.mock("jose", () => ({
  createRemoteJWKSet: mockCreateRemoteJWKSet,
  jwtVerify: mockJwtVerify,
}));

import { createJoseVerifier } from "./plugin.js";

const payload = {
  sub: "auth0|user-123",
  iss: "https://test.auth0.com/",
  aud: "https://api.example.com",
};

describe("createJoseVerifier (default OIDC/JWKS adapter, ADR-010)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the JWKS set from the authority's well-known endpoint", () => {
    createJoseVerifier("https://test.auth0.com", "https://api.example.com");

    expect(mockCreateRemoteJWKSet).toHaveBeenCalledTimes(1);
    const url = mockCreateRemoteJWKSet.mock.calls[0][0] as URL;
    expect(url.toString()).toBe("https://test.auth0.com/.well-known/jwks.json");
  });

  it("normalizes a trailing slash on the authority before building the JWKS URI", () => {
    createJoseVerifier("https://test.auth0.com/", "https://api.example.com");

    const url = mockCreateRemoteJWKSet.mock.calls[0][0] as URL;
    expect(url.toString()).toBe("https://test.auth0.com/.well-known/jwks.json");
  });

  it("verifies with the normalized issuer and configured audience, returning the payload", async () => {
    mockJwtVerify.mockResolvedValueOnce({ payload, protectedHeader: { alg: "RS256" } });

    const verify = createJoseVerifier("https://test.auth0.com", "https://api.example.com");
    const result = await verify("valid-token");

    expect(mockJwtVerify).toHaveBeenCalledWith("valid-token", "mock-jwks", {
      issuer: "https://test.auth0.com/",
      audience: "https://api.example.com",
    });
    expect(result).toEqual(payload);
  });

  it("propagates verification errors from jose", async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error("Invalid token"));

    const verify = createJoseVerifier("https://test.auth0.com", "https://api.example.com");
    await expect(verify("bad-token")).rejects.toThrow("Invalid token");
  });
});
