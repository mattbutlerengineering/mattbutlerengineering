/**
 * scripts/e2e-auth-preflight.mjs
 *
 * Confirms the E2E Auth0 seed user can obtain a token via ROPC before the test
 * suite runs. Exits non-zero with a clear diagnostic message on failure so
 * auth/seed drift surfaces immediately rather than cascading into ~25 test fails.
 *
 * Security: never logs credential values or token payloads.
 *
 * Usage: node scripts/e2e-auth-preflight.mjs
 */

/** @typedef {{ ok: true } | { ok: false; reason: string }} PreflightResult */

const REQUIRED_VARS = [
  "E2E_AUTH0_DOMAIN",
  "E2E_AUTH0_CLIENT_ID",
  "E2E_AUTH0_AUDIENCE",
  "E2E_AUTH_EMAIL",
  "E2E_AUTH_PASSWORD",
];

/**
 * Validates that all required env vars are present.
 * @param {Record<string, string | undefined>} env
 * @returns {PreflightResult}
 */
export function validatePreflightEnv(env) {
  const missing = REQUIRED_VARS.filter((v) => !env[v]);
  if (missing.length > 0) {
    return { ok: false, reason: `missing env vars: ${missing.join(", ")}` };
  }
  return { ok: true };
}

/**
 * Runs the Auth0 ROPC preflight check.
 * Takes env and fetchFn as parameters for testability — no real network calls
 * in unit tests.
 *
 * @param {Record<string, string | undefined>} env
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<PreflightResult>}
 */
export async function runAuthPreflight(env, fetchFn = fetch) {
  const envResult = validatePreflightEnv(env);
  if (!envResult.ok) return envResult;

  const domain = env["E2E_AUTH0_DOMAIN"];
  const clientId = env["E2E_AUTH0_CLIENT_ID"];
  const audience = env["E2E_AUTH0_AUDIENCE"];
  const email = env["E2E_AUTH_EMAIL"];
  const password = env["E2E_AUTH_PASSWORD"];

  try {
    const response = await fetchFn(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "http://auth0.com/oauth/grant-type/password-realm",
        username: email,
        password,
        audience,
        client_id: clientId,
        scope: "openid profile email",
        realm: "Username-Password-Authentication",
      }),
    });

    if (response.ok) {
      // Consume body without storing or logging the token value
      await response.json();
      return { ok: true };
    }

    const body = await response.json().catch(() => ({}));
    // Only include the error code (not credentials or description) to avoid leakage
    const errorCode =
      typeof body === "object" && body !== null && "error" in body ? String(body.error) : "unknown";
    return {
      ok: false,
      reason: `auth rejected (HTTP ${response.status}): ${errorCode}`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function main() {
  const result = await runAuthPreflight(process.env);
  if (!result.ok) {
    process.stderr.write(`E2E auth preflight failed: ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write("E2E auth preflight passed: seed user authenticated successfully\n");
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  main();
}
