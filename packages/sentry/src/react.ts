import * as Sentry from "@sentry/react";
import type { ErrorInfo } from "react";
import { resolveConfig } from "./config.js";

/**
 * Structural error type accepted by reportApiError.
 * Any object with statusCode and message satisfies this — including ApiClientError.
 */
export interface ReportableApiError {
  readonly statusCode: number;
  readonly message: string;
  readonly method?: string;
  readonly path?: string;
}

export interface InitOptions {
  readonly appName: string;
  readonly dsn: string;
  /**
   * Browser callers pass `import.meta.env.MODE`: `process.env` does not exist
   * in a Vite bundle, so resolveConfig() cannot see the build mode there.
   */
  readonly environment?: string;
}

export function initSentry(options: InitOptions): void {
  const config = resolveConfig(options.dsn);
  if (!config.enabled) {
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: options.environment ?? config.environment,
    // An own `release: undefined` key would override the SDK's default, which
    // reads the SENTRY_RELEASE global that sentryVitePlugin injects into the
    // bundle — so only pass release when one was actually resolved.
    ...(config.release !== undefined && { release: config.release }),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [],
  });

  Sentry.setTag("app", options.appName);
}

export function handleErrorBoundary(error: Error, errorInfo: ErrorInfo): void {
  Sentry.withScope((scope) => {
    scope.setExtra("componentStack", errorInfo.componentStack);
    Sentry.captureException(error);
  });
}

/**
 * Report an API client error to Sentry with severity classification.
 *
 * - 5xx → captureException (error-level breadcrumb)
 * - 401/403 → captureMessage with "warning" severity
 * - Other 4xx → breadcrumb only
 */
export function reportApiError(error: ReportableApiError): void {
  const code = error.statusCode;

  Sentry.addBreadcrumb({
    category: "api",
    message: `${error.method} ${error.path} → ${code}`,
    level: code >= 500 ? "error" : "warning",
    data: { statusCode: code, method: error.method, path: error.path },
  });

  if (code >= 500) {
    Sentry.captureException(error);
  } else if (code === 401 || code === 403) {
    Sentry.captureMessage(error.message, "warning");
  }
}
