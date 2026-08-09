export interface UnsubscribeTokenConfig {
  secret: string;
}

interface UnsubscribeTokenConfigInput {
  nodeEnv: string | undefined;
  secret: string | undefined;
}

/**
 * Validates the UNSUBSCRIBE_TOKEN_SECRET environment variable and returns a typed config.
 *
 * In production: throws if UNSUBSCRIBE_TOKEN_SECRET is absent or empty.
 * In non-production: warns loudly but allows empty values (local dev without real tokens).
 */
export function getUnsubscribeTokenConfig(
  input: UnsubscribeTokenConfigInput
): UnsubscribeTokenConfig {
  const isProduction = input.nodeEnv === "production";
  const secret = input.secret ?? "";

  if (isProduction) {
    if (!secret) {
      throw new Error(
        "UNSUBSCRIBE_TOKEN_SECRET is required in production. Set this environment variable to a strong random secret."
      );
    }
  } else {
    if (!secret) {
      console.warn(
        "[WARN] UNSUBSCRIBE_TOKEN_SECRET is not set. Unsubscribe tokens will use an empty secret — do not deploy this to production."
      );
    }
  }

  return { secret };
}
