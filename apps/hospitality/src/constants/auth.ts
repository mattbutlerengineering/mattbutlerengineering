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
      redirectUri:
        import.meta.env.VITE_AUTH_REDIRECT_URI || window.location.origin + "/hospitality/callback",
      audience: import.meta.env.VITE_AUTH_AUDIENCE || undefined,
    },
  };
}
