import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Heading } from "../Heading/Heading";
import styles from "./ErrorBoundary.module.css";

export interface ErrorBoundaryProps {
  /** Content to render when no error has occurred. */
  readonly children: ReactNode;
  /** Optional custom fallback UI. When omitted, a default "Something went wrong" message is shown. */
  readonly fallback?: ReactNode;
  /** Optional callback invoked when an error is caught. Use to report errors to external services. */
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
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

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
    this.props.onError?.(error, info);
  }

  private handleRefresh = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      return (
        <div className={styles.container} role="alert">
          <Heading level={1} size={3} className={styles.heading}>
            Something went wrong
          </Heading>
          <p className={styles.message}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <button type="button" className={styles.button} onClick={this.handleRefresh}>
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
