/**
 * Maps a raw OIDC/auth error to user-facing language.
 *
 * The auth provider surfaces `Error` instances whose messages are written for
 * developers ("No matching state found in storage"). This module owns the
 * translation to guest-friendly copy so the JSX never has to.
 */
export interface AuthErrorDescription {
  /** Short, human headline for the error screen. */
  readonly title: string;
  /** One-sentence explanation in user language. */
  readonly body: string;
  /** Whether offering a retry action makes sense for this category. */
  readonly canRetry: boolean;
}

const ACCESS_DENIED_PATTERN = /access[_ ]denied/i;
const EXPIRED_FLOW_PATTERN = /matching state|state mismatch|nonce|login_required/i;
const NETWORK_PATTERN = /network|failed to fetch|timed?[ _]?out|timeout|connection|unreachable/i;

/** Reads the OIDC `error` code (e.g. "access_denied") when the provider attached one. */
function oidcErrorCode(error: Error): string {
  const code = (error as Error & { error?: unknown }).error;
  return typeof code === "string" ? code : "";
}

export function describeAuthError(error: Error): AuthErrorDescription {
  const haystack = `${oidcErrorCode(error)} ${error.message}`;

  if (ACCESS_DENIED_PATTERN.test(haystack)) {
    return {
      title: "Access denied",
      body: "Your account doesn't have access to Hospitality. Contact your administrator if you think this is a mistake.",
      canRetry: false,
    };
  }

  if (EXPIRED_FLOW_PATTERN.test(haystack)) {
    return {
      title: "That sign-in link expired",
      body: "Sign-in links are single-use. Start again and it should go through.",
      canRetry: true,
    };
  }

  if (NETWORK_PATTERN.test(haystack)) {
    return {
      title: "Can't reach the sign-in service",
      body: "Check your connection and try again in a moment.",
      canRetry: true,
    };
  }

  return {
    title: "Sign-in hit a snag",
    body: "Something unexpected happened during sign-in. Trying again usually clears it up.",
    canRetry: true,
  };
}
