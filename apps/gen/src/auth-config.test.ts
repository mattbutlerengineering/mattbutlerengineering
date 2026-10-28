import { describe, expect, it } from "vitest";
import { buildGenAuthConfig } from "./auth-config.js";

describe("buildGenAuthConfig", () => {
  it("sends sign-out back to /gen, not the login callback", () => {
    const config = buildGenAuthConfig(
      {
        authority: "https://tenant.auth0.com",
        clientId: "client",
        redirectUri: "https://mattbutlerengineering.com/gen/callback",
        audience: "https://api.example.com",
      },
      "https://mattbutlerengineering.com"
    );

    expect(config.redirectUri).toBe("https://mattbutlerengineering.com/gen/callback");
    expect(config.postLogoutRedirectUri).toBe("https://mattbutlerengineering.com/gen");
    expect(config.audience).toBe("https://api.example.com");
  });

  it("derives the callback and the logout URL from the page origin when unset", () => {
    const config = buildGenAuthConfig({}, "http://localhost:3005");
    expect(config.redirectUri).toBe("http://localhost:3005/gen/callback");
    expect(config.postLogoutRedirectUri).toBe("http://localhost:3005/gen");
  });

  it("does not invent a logout URL from a non-gen redirect", () => {
    const config = buildGenAuthConfig(
      { redirectUri: "https://example.com/oauth/callback" },
      "https://mattbutlerengineering.com"
    );
    expect(config.redirectUri).toBe("https://example.com/oauth/callback");
    expect(config.postLogoutRedirectUri).toBe("https://mattbutlerengineering.com/gen");
  });
});
