export interface ManageTokenConfig {
  secret: string;
}

interface ManageTokenConfigInput {
  nodeEnv: string | undefined;
  secret: string | undefined;
}

/**
 * Validates the MANAGE_TOKEN_SECRET environment variable and returns a typed config.
 *
 * In production: throws if MANAGE_TOKEN_SECRET is absent or empty.
 * In non-production: warns loudly but allows empty values (local dev without real tokens).
 */
export function getManageTokenConfig(input: ManageTokenConfigInput): ManageTokenConfig {
  const isProduction = input.nodeEnv === "production";
  const secret = input.secret ?? "";

  if (isProduction) {
    if (!secret) {
      throw new Error(
        "MANAGE_TOKEN_SECRET is required in production. Set this environment variable to a strong random secret."
      );
    }
  } else {
    if (!secret) {
      console.warn(
        "[WARN] MANAGE_TOKEN_SECRET is not set. Manage tokens will use an empty secret — do not deploy this to production."
      );
    }
  }

  return { secret };
}
