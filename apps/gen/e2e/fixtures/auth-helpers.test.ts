import { describe, it, expect, vi } from "vitest";
import { fetchAuth0Tokens } from "../auth-helpers.js";
import type { Auth0Config } from "../auth-helpers.js";

const CONFIG: Auth0Config = {
  domain: "dev-test.us.auth0.com",
  clientId: "test-client-id",
  audience: "https://api.example.com",
  email: "test@example.com",
  password: "test-password",
};

const TOKENS = {
  access_token: "test-access-token",
  id_token: "test-id-token",
  token_type: "Bearer",
  expires_in: 86400,
};

describe("fetchAuth0Tokens", () => {
  it("requests the password-realm grant with an explicit realm", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(TOKENS), { status: 200 }));

    await fetchAuth0Tokens(CONFIG, fetchFn as unknown as typeof fetch);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://dev-test.us.auth0.com/oauth/token");
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.grant_type).toBe("http://auth0.com/oauth/grant-type/password-realm");
    expect(body.realm).toBe("Username-Password-Authentication");
    expect(body.client_id).toBe("test-client-id");
    expect(body.username).toBe("test@example.com");
  });

  it("throws with the status and body when Auth0 rejects the request", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 500 }));

    await expect(fetchAuth0Tokens(CONFIG, fetchFn as unknown as typeof fetch)).rejects.toThrow(
      "Auth0 token request failed (500): nope"
    );
  });
});
