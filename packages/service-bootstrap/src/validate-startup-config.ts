/**
 * Shared startup config validation.
 *
 * Runs once during {@link createServiceApp} (i.e. during each service's
 * `buildApp()` / boot) so that a malformed `AUTH_AUTHORITY` fails the deploy
 * loudly instead of booting and serving traffic behind a red readiness probe.
 * See ADR-021 for the fail-fast-vs-degrade decision.
 *
 * This is the single home for the `AUTH_AUTHORITY` -> JWKS-URL contract: both
 * the boot-time validation here and the runtime readiness probe in each
 * service's `ready.ts` build the JWKS URL via {@link buildJwksUrl}.
 */

/**
 * Builds the Auth0 JWKS URL from an `AUTH_AUTHORITY` origin.
 *
 * Returns `undefined` when the authority is absent/empty (matching the
 * fail-closed auth gate, which treats an empty value as "not configured").
 * A single trailing slash is stripped so the JWKS path is never doubled.
 */
export function buildJwksUrl(authority: string | undefined): string | undefined {
  if (!authority) {
    return undefined;
  }
  return `${authority.replace(/\/$/, "")}/.well-known/jwks.json`;
}

/**
 * Describes an env value by SHAPE only — never its raw content. Used so a
 * boot failure is legible in logs without leaking a potentially sensitive
 * configuration value.
 */
function describeShape(value: string): string {
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value.trim());
  return `length=${value.length}, scheme=${hasScheme ? "present" : "absent"}`;
}

function parseUrlOrNull(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const EXPECTED_SHAPE = "an absolute https URL, e.g. https://your-tenant.us.auth0.com";

/**
 * Validates startup-critical configuration, throwing on a malformed value so
 * the service refuses to start rather than degrade.
 *
 * Currently validates `AUTH_AUTHORITY`: when present, it must parse as an
 * http(s) URL and yield a well-formed JWKS URL. Absence is intentionally NOT
 * an error here — that is governed by the fail-closed auth gate in
 * {@link createServiceApp} (warn in dev/test, throw in production).
 *
 * Errors name the offending variable and its value SHAPE only; the raw value
 * is never included in the message.
 *
 * @throws {Error} when `AUTH_AUTHORITY` is set but malformed.
 */
export function validateStartupConfig(env: NodeJS.ProcessEnv = process.env): void {
  const authority = env.AUTH_AUTHORITY;

  // Absent/empty is "not configured", handled by the fail-closed auth gate.
  // Only a value that is present-but-malformed is a fail-fast condition here.
  if (authority === undefined || authority === "") {
    return;
  }

  const parsed = parseUrlOrNull(authority);
  if (parsed === null) {
    throw new Error(
      `Invalid AUTH_AUTHORITY: value is not a parseable URL (${describeShape(authority)}). ` +
        `Expected ${EXPECTED_SHAPE}.`
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      `Invalid AUTH_AUTHORITY: URL scheme must be http or https, got "${parsed.protocol}" ` +
        `(${describeShape(authority)}). Expected ${EXPECTED_SHAPE}.`
    );
  }

  if (parsed.hostname === "") {
    throw new Error(
      `Invalid AUTH_AUTHORITY: URL has no host (${describeShape(authority)}). ` +
        `Expected ${EXPECTED_SHAPE}.`
    );
  }

  const jwksUrl = buildJwksUrl(authority);
  if (jwksUrl === undefined || parseUrlOrNull(jwksUrl) === null) {
    throw new Error(
      `Invalid AUTH_AUTHORITY: does not yield a well-formed JWKS URL (${describeShape(authority)}). ` +
        `Expected ${EXPECTED_SHAPE}.`
    );
  }
}
