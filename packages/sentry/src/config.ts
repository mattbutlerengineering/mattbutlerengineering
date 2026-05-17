declare const process: { env: Record<string, string | undefined> } | undefined;

export interface SentryConfig {
  readonly dsn: string;
  readonly environment: string;
  readonly release: string | undefined;
  readonly enabled: boolean;
}

export function resolveConfig(dsn: string | undefined): SentryConfig {
  const resolvedDsn = dsn ?? "";
  return {
    dsn: resolvedDsn,
    environment:
      (typeof process !== "undefined" ? process.env.SENTRY_ENVIRONMENT : undefined) ??
      (typeof process !== "undefined" ? process.env.NODE_ENV : undefined) ??
      "development",
    release:
      (typeof process !== "undefined" ? process.env.SENTRY_RELEASE : undefined) ??
      (typeof process !== "undefined" ? process.env.npm_package_version : undefined),
    enabled: resolvedDsn.length > 0,
  };
}
