import type { TFunction } from "i18next";
import { localeRuntime } from "../i18n/runtime.js";

/**
 * Maps a raw OIDC/auth error to user-facing language.
 *
 * The auth provider surfaces `Error` instances whose messages are written for
 * developers ("No matching state found in storage"). This module owns the
 * translation to guest-friendly copy so the JSX never has to. Copy comes from
 * the active locale's catalog; callers inside React pass their own `t`.
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

export function describeAuthError(
  error: Error,
  t: TFunction = localeRuntime.i18n.t
): AuthErrorDescription {
  const haystack = `${oidcErrorCode(error)} ${error.message}`;

  if (ACCESS_DENIED_PATTERN.test(haystack)) {
    return {
      title: t("auth.error.accessDenied.title"),
      body: t("auth.error.accessDenied.body"),
      canRetry: false,
    };
  }

  if (EXPIRED_FLOW_PATTERN.test(haystack)) {
    return {
      title: t("auth.error.expiredLink.title"),
      body: t("auth.error.expiredLink.body"),
      canRetry: true,
    };
  }

  if (NETWORK_PATTERN.test(haystack)) {
    return {
      title: t("auth.error.network.title"),
      body: t("auth.error.network.body"),
      canRetry: true,
    };
  }

  return {
    title: t("auth.error.generic.title"),
    body: t("auth.error.generic.body"),
    canRetry: true,
  };
}
