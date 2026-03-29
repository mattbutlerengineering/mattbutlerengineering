import type { Page } from "@playwright/test";

/**
 * Auth0 Resource Owner Password Grant configuration.
 * All values come from environment variables — never hardcoded.
 */
interface Auth0Config {
  domain: string;
  clientId: string;
  audience: string;
  email: string;
  password: string;
}

function getAuth0Config(): Auth0Config {
  const domain = process.env.E2E_AUTH0_DOMAIN;
  const clientId = process.env.E2E_AUTH0_CLIENT_ID;
  const audience = process.env.E2E_AUTH0_AUDIENCE;
  const email = process.env.E2E_AUTH_EMAIL;
  const password = process.env.E2E_AUTH_PASSWORD;

  if (!domain || !clientId || !audience || !email || !password) {
    throw new Error(
      "Missing required E2E auth env vars. Required:\n" +
        "  E2E_AUTH0_DOMAIN      — Auth0 tenant domain (e.g. dev-xxx.us.auth0.com)\n" +
        "  E2E_AUTH0_CLIENT_ID   — Auth0 app client ID (ROPC-enabled)\n" +
        "  E2E_AUTH0_AUDIENCE    — API audience identifier\n" +
        "  E2E_AUTH_EMAIL        — Test user email\n" +
        "  E2E_AUTH_PASSWORD     — Test user password\n\n" +
        "The Auth0 app must have the Password grant type enabled and the test user must not have MFA."
    );
  }

  return { domain, clientId, audience, email, password };
}

/**
 * Token response from Auth0's /oauth/token endpoint.
 */
interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Fetches tokens from Auth0 using the Resource Owner Password Grant.
 * This bypasses the browser login flow entirely — fast, reliable, CI-friendly.
 */
async function fetchAuth0Tokens(config: Auth0Config): Promise<TokenResponse> {
  const response = await fetch(`https://${config.domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      username: config.email,
      password: config.password,
      audience: config.audience,
      client_id: config.clientId,
      scope: "openid profile email",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Auth0 token request failed (${response.status}): ${body}\n` +
        "Verify: ROPC grant enabled, test user exists, no MFA, correct credentials."
    );
  }

  return response.json() as Promise<TokenResponse>;
}

/**
 * Decodes a JWT payload without verification (tokens come directly from Auth0).
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split(".")[1];
  const json = Buffer.from(base64, "base64url").toString("utf-8");
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Builds the oidc-client-ts session storage object that react-oidc-context reads.
 * The key format is: oidc.user:<authority>:<client_id>
 */
function buildOidcUserEntry(
  config: Auth0Config,
  tokens: TokenResponse
): { key: string; value: string } {
  const authority = `https://${config.domain}`;
  const idClaims = decodeJwtPayload(tokens.id_token);

  const oidcUser = {
    access_token: tokens.access_token,
    id_token: tokens.id_token,
    token_type: tokens.token_type,
    scope: "openid profile email",
    expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
    profile: {
      sub: idClaims.sub,
      email: idClaims.email,
      email_verified: idClaims.email_verified,
      name: idClaims.name,
      picture: idClaims.picture,
      iss: idClaims.iss,
      aud: idClaims.aud,
      iat: idClaims.iat,
      exp: idClaims.exp,
    },
  };

  return {
    key: `oidc.user:${authority}:${config.clientId}`,
    value: JSON.stringify(oidcUser),
  };
}

/**
 * Injects authenticated session into the page's sessionStorage.
 * After calling this, the react-oidc-context AuthProvider will see the user
 * as authenticated without any browser-based login flow.
 *
 * Usage in Playwright setup:
 *   await injectAuth0Session(page);
 *   // page is now authenticated — navigate anywhere
 */
export async function injectAuth0Session(page: Page): Promise<void> {
  const config = getAuth0Config();
  const tokens = await fetchAuth0Tokens(config);
  const entry = buildOidcUserEntry(config, tokens);

  // Navigate to the app first so sessionStorage is on the correct origin
  await page.goto("/");
  await page.evaluate(
    ({ key, value }) => {
      sessionStorage.setItem(key, value);
    },
    entry
  );

  // Reload so AuthProvider picks up the injected session
  await page.reload();
}

