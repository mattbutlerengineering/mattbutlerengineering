export interface PublicApiBaseUrlConfig {
  /**
   * Origin for guest-facing API links, trailing slash stripped.
   * Null when PUBLIC_API_BASE_URL is unconfigured — deliberately NOT a default.
   */
  baseUrl: string | null;
}

interface PublicApiBaseUrlConfigInput {
  baseUrl: string | undefined;
  /** True when outbound email can actually send (RESEND_API_KEY present). */
  emailEnabled: boolean;
}

/**
 * Validates PUBLIC_API_BASE_URL — the origin the unsubscribe link in post-visit
 * emails is built from.
 *
 * Absent: returns null, and logs loudly when email is enabled (i.e. when the
 * gap has consequences). It does NOT throw, because the blast radius of
 * refusing to boot would be the whole reservations API for the sake of one
 * email link; the adapter refuses that single send instead. Absence must never
 * resolve to a default — a production URL living only in a `??` fallback is
 * exactly how #4517 stayed invisible.
 *
 * Present but malformed: throws. Unlike absence, that state requires someone to
 * have set the variable, so failing loudly at boot costs nothing and a
 * scheme-less or non-http value could never build a working link anyway.
 */
export function getPublicApiBaseUrlConfig(
  input: PublicApiBaseUrlConfigInput
): PublicApiBaseUrlConfig {
  const raw = (input.baseUrl ?? "").trim();

  if (raw === "") {
    if (input.emailEnabled) {
      console.error(
        "[ERROR] PUBLIC_API_BASE_URL is not set while email sending is enabled. " +
          "Refusing to build guest unsubscribe links from MANAGE_BASE_URL (that is a web " +
          "host, not the API) — post-visit emails will fail until PUBLIC_API_BASE_URL is " +
          "configured to the public API origin, e.g. https://api.mattbutlerengineering.com (see #4517)."
      );
    }
    return { baseUrl: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `Invalid PUBLIC_API_BASE_URL: "${raw}" is not an absolute URL. ` +
        "Expected an origin such as https://api.mattbutlerengineering.com."
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      `Invalid PUBLIC_API_BASE_URL: scheme must be http or https, got "${parsed.protocol}". ` +
        "Expected an origin such as https://api.mattbutlerengineering.com."
    );
  }

  return { baseUrl: raw.replace(/\/+$/, "") };
}
