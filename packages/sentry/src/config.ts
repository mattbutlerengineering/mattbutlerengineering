import { resolveBuildInfo } from "./build-info.js";

declare const process: { env: Record<string, string | undefined> } | undefined;

export interface SentryConfig {
  readonly dsn: string;
  readonly environment: string;
  readonly release: string;
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
      resolveBuildInfo(typeof process !== "undefined" ? process.env : {}).version,
    enabled: resolvedDsn.length > 0,
  };
}
