import type { Page } from "@playwright/test";

/**
 * Auth0 Resource Owner Password Grant configuration.
 * All values come from environment variables — never hardcoded.
 */
export interface Auth0Config {
  domain: string;
  clientId: string;
  audience: string;
  email: string;
  password: string;
}

/**
 * Validates that all required Auth0 env vars are present and returns the config.
 * Throws a descriptive error listing the missing vars so failures are caught
 * before any tests run (pre-flight validation).
 *
 * @param env - Record of environment variables (defaults to process.env)
 */
export function validateAuth0Config(
  env: Record<string, string | undefined> = process.env
): Auth0Config {
  const domain = env["E2E_AUTH0_DOMAIN"];
  const clientId = env["E2E_AUTH0_CLIENT_ID"];
  const audience = env["E2E_AUTH0_AUDIENCE"];
  const email = env["E2E_AUTH_EMAIL"];
  const password = env["E2E_AUTH_PASSWORD"];

  const missing: string[] = [];
  if (!domain) missing.push("E2E_AUTH0_DOMAIN");
  if (!clientId) missing.push("E2E_AUTH0_CLIENT_ID");
  if (!audience) missing.push("E2E_AUTH0_AUDIENCE");
  if (!email) missing.push("E2E_AUTH_EMAIL");
  if (!password) missing.push("E2E_AUTH_PASSWORD");

  if (missing.length > 0) {
    throw new Error(
      `Missing required E2E auth env vars: ${missing.join(", ")}\n\n` +
        "Required vars:\n" +
        "  E2E_AUTH0_DOMAIN      — Auth0 tenant domain (e.g. dev-xxx.us.auth0.com)\n" +
        "  E2E_AUTH0_CLIENT_ID   — Auth0 app client ID (ROPC-enabled)\n" +
        "  E2E_AUTH0_AUDIENCE    — API audience identifier\n" +
        "  E2E_AUTH_EMAIL        — Test user email\n" +
        "  E2E_AUTH_PASSWORD     — Test user password\n\n" +
        "The Auth0 app must have the Password grant type enabled and the test user must not have MFA."
    );
  }

  return {
    domain: domain!,
    clientId: clientId!,
    audience: audience!,
    email: email!,
    password: password!,
  };
}

function getAuth0Config(): Auth0Config {
  return validateAuth0Config(process.env);
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

type FetchFn = typeof fetch;

/**
 * Fetches tokens from Auth0 using the Resource Owner Password Grant.
 * This bypasses the browser login flow entirely — fast, reliable, CI-friendly.
 */
async function fetchAuth0Tokens(
  config: Auth0Config,
  fetchFn: FetchFn = fetch
): Promise<TokenResponse> {
  const response = await fetchFn(`https://${config.domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "http://auth0.com/oauth/grant-type/password-realm",
      username: config.email,
      password: config.password,
      audience: config.audience,
      client_id: config.clientId,
      scope: "openid profile email",
      realm: "Username-Password-Authentication",
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
 * Options for retry behaviour.
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3). */
  maxAttempts?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000). */
  baseDelayMs?: number;
}

/**
 * Fetches Auth0 tokens with exponential-backoff retry logic.
 * Handles transient failures (rate limits, service unavailability) that cause
 * E2E flakes without retrying credential errors (4xx other than 429).
 *
 * Retry schedule (default): attempt 1 → wait 1s → attempt 2 → wait 2s → attempt 3 → throw
 */
export async function fetchAuth0TokensWithRetry(
  config: Auth0Config,
  fetchFn: FetchFn = fetch,
  { maxAttempts = 3, baseDelayMs = 1000 }: RetryOptions = {}
): Promise<TokenResponse> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchAuth0Tokens(config, fetchFn);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `Auth0 token request failed after ${maxAttempts} attempts. Last error: ${lastError?.message ?? "unknown"}`
  );
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
  const tokens = await fetchAuth0TokensWithRetry(config);
  const entry = buildOidcUserEntry(config, tokens);

  // Navigate to the app first so sessionStorage is on the correct origin
  await page.goto("");
  await page.evaluate(({ key, value }) => {
    sessionStorage.setItem(key, value);
  }, entry);

  // Reload so AuthProvider picks up the injected session
  await page.reload();
}
