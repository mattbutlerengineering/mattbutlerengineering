/**
 * Shared startup config validation.
 *
 * Runs once during {@link createServiceApp} (i.e. during each service's
 * `buildApp()` / boot) so that a malformed `AUTH_AUTHORITY` fails the deploy
 * loudly instead of booting and serving traffic behind a red readiness probe.
 * See ADR-021 for the fail-fast-vs-degrade decision.
 *
 * `buildJwksUrl` — the shared `AUTH_AUTHORITY` -> JWKS-URL contract used by
 * both the boot-time validation here and the runtime readiness probe in
 * `readiness-routes.ts` — now lives in `@mbe/observability` (co-located with
 * `registerStandardChecks`, its runtime consumer; see #4200) and is
 * re-exported here so this file's existing import sites keep working.
 */
import { buildJwksUrl } from "@mbe/observability";
export { buildJwksUrl };

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
  // SENTRY_DSN is required in production, and unlike AUTH_AUTHORITY its ABSENCE
  // is the fail-fast condition. `initSentry` returns early and silently when the
  // DSN is missing, so a service reporting nothing because it is unconfigured
  // and one reporting nothing because it has not errored yet are byte-identical
  // from outside. That is what let backend errors go unreported for five months.
  // Boot is the last moment the distinction is still observable, so it is made
  // here. Dev and test are deliberately unaffected: local runs and the test
  // suite must not need a DSN.
  if (env.NODE_ENV === "production" && (env.SENTRY_DSN ?? "").trim() === "") {
    throw new Error(
      "Missing SENTRY_DSN in production: the service would boot with error " +
        "reporting silently disabled. Set it in the deploy environment."
    );
  }

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
