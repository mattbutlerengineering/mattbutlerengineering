/**
 * The single decision about what may leave the process.
 *
 * Every exporter routes outbound signals through `redactSignal` rather than
 * deciding for itself, so adding a fourth signal later cannot quietly ship a
 * credential. The policy is deliberately asymmetric: credentials are stripped,
 * identifiers are kept. `venueId`, `guestId`, the request URL and the client IP
 * are most of the diagnostic value being recovered, so removing them would
 * defeat the reason telemetry is being turned on at all.
 */

/** Replacement written in place of anything the policy strips. */
export const REDACTED = "[redacted]";

/**
 * Keys whose value is replaced wholesale, without inspecting it. Compared
 * lowercased, because header casing varies by transport and `Authorization`
 * must be caught as surely as `authorization`.
 *
 * `cookies` (plural) is not a header. `@sentry/core`'s RequestData integration
 * writes a PARSED cookie map next to the raw header — keys are cookie names
 * (`session`, `connect.sid`), values are the credentials. Those names match no
 * header rule and a session id is not secret-shaped, so without this entry the
 * parsed copy would ship while the header it came from was redacted.
 */
const CREDENTIAL_KEYS: ReadonlySet<string> = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "cookies",
]);

/**
 * Values that are secret-shaped wherever they appear, not just under a known
 * key — a token pasted into a log message is still a token.
 *
 * These intentionally mirror the classes `scripts/secret-scan.mjs` already
 * treats as secrets at edit time. They are duplicated rather than imported:
 * that module is a plain `.mjs` under `scripts/`, outside this package's build
 * context and absent from the service Docker images. See breakdown.md Notes.
 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|pk|rk)_live_[0-9a-zA-Z]{8,}/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

function isSecretShaped(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * A plain object, as opposed to an array or a class instance. Only plain
 * objects and arrays are walked; anything else (Date, Buffer, Error, Map) is
 * passed through untouched rather than being rebuilt into something lossy.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Returns a redacted copy of `value`. Never mutates its input — exporters may
 * be handed an object the application still holds a reference to.
 */
export function redactSignal(value: unknown): unknown {
  if (typeof value === "string") {
    return isSecretShaped(value) ? REDACTED : value;
  }

  if (Array.isArray(value)) {
    return value.map(redactSignal);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) =>
        CREDENTIAL_KEYS.has(key.toLowerCase()) ? [key, REDACTED] : [key, redactSignal(entry)]
      )
    );
  }

  return value;
}
