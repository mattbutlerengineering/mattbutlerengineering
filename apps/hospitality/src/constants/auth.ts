import { appUrl } from "../lib/host-brand.js";

/**
 * Required auth environment variables and their corresponding VITE_* names.
 * Used for runtime validation before initializing the OIDC provider.
 */
const REQUIRED_AUTH_ENV = [
  { key: "VITE_AUTH_AUTHORITY", value: import.meta.env.VITE_AUTH_AUTHORITY },
  { key: "VITE_AUTH_CLIENT_ID", value: import.meta.env.VITE_AUTH_CLIENT_ID },
] as const;

export interface AuthConfigResult {
  readonly valid: true;
  readonly config: {
    readonly authority: string;
    readonly clientId: string;
    readonly redirectUri: string;
    readonly audience: string | undefined;
  };
}

export interface AuthConfigFailure {
  readonly valid: false;
  readonly missing: readonly string[];
}

/**
 * The OIDC redirect URI (also the post-logout return URL) for the host serving
 * the app. The app is served from more than one host (#7709), so a build-time
 * VITE_AUTH_REDIRECT_URI is honored only when it is on the serving origin;
 * otherwise the callback is derived from that origin and the host's basename.
 */
export function resolveRedirectUri(
  configured: string | undefined,
  location: Pick<Location, "origin" | "hostname">
): string {
  // A malformed value is treated as unset.
  const sameOrigin =
    !!configured && URL.canParse(configured) && new URL(configured).origin === location.origin;
  return sameOrigin ? configured : appUrl("/callback", location);
}

/**
 * Validates that all required auth environment variables are present and non-empty.
 * Returns either a validated config object or a list of missing variable names.
 */
export function validateAuthConfig(): AuthConfigResult | AuthConfigFailure {
  const missing = REQUIRED_AUTH_ENV.filter((env) => !env.value || env.value.trim() === "").map(
    (env) => env.key
  );

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return {
    valid: true,
    config: {
      authority: import.meta.env.VITE_AUTH_AUTHORITY,
      clientId: import.meta.env.VITE_AUTH_CLIENT_ID,
      redirectUri: resolveRedirectUri(import.meta.env.VITE_AUTH_REDIRECT_URI, window.location),
      audience: import.meta.env.VITE_AUTH_AUDIENCE || undefined,
    },
  };
}
