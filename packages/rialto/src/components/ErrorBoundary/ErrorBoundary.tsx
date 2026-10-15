import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Heading, type HeadingLevel } from "../Heading/Heading";
import styles from "./ErrorBoundary.module.css";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";

export interface ErrorBoundaryProps {
  /** Content to render when no error has occurred. */
  readonly children: ReactNode;
  /** Optional custom fallback UI. When omitted, a default "Something went wrong" message is shown. */
  readonly fallback?: ReactNode;
  /** Optional callback invoked when an error is caught. Use to report errors to external services. */
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Semantic heading level for the default fallback title. @default 1 */
  readonly headingLevel?: HeadingLevel;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

/* ── Default fallback ───────────────────────── */
// A function component so the class boundary can read the locale from context.
function ErrorFallback({
  headingLevel,
  onRefresh,
}: {
  readonly headingLevel: HeadingLevel;
  readonly onRefresh: () => void;
}) {
  const { messages } = useRialtoLocale();
  return (
    <div className={styles.container} role="alert">
      <Heading level={headingLevel} size={3} className={styles.heading}>
        {messages.errorTitle}
      </Heading>
      <p className={styles.message}>{messages.errorMessage}</p>
      <button type="button" className={styles.button} onClick={onRefresh}>
        {messages.refreshPage}
      </button>
    </div>
  );
}

/**
 * Catches unhandled React render errors and displays a user-friendly fallback
 * instead of crashing the entire app to a blank screen.
 *
 * Must be a class component — React does not support error boundaries as
 * function components (as of React 19).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
    this.props.onError?.(error, info);
  }

  private handleRefresh = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback headingLevel={this.props.headingLevel ?? 1} onRefresh={this.handleRefresh} />
      );
    }

    return this.props.children;
  }
}
