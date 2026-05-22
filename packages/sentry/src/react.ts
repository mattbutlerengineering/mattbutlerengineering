import * as Sentry from "@sentry/react";
import type { ErrorInfo } from "react";
import { resolveConfig } from "./config.js";

export interface InitOptions {
  readonly appName: string;
  readonly dsn: string;
}

export function initSentry(options: InitOptions): void {
  const config = resolveConfig(options.dsn);
  if (!config.enabled) {
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
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

export const captureException = Sentry.captureException.bind(Sentry);
export const captureMessage = Sentry.captureMessage.bind(Sentry);
export const addBreadcrumb = Sentry.addBreadcrumb.bind(Sentry);
