import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  readonly children: ReactNode;
  readonly onError: (error: Error) => void;
}

interface State {
  readonly failed: boolean;
}

/**
 * Catches a render error anywhere in the remote's root. It renders nothing and reports the
 * error to the host, which swaps to its degraded sidebar (ux.md F10.5). It never retries: a
 * swap inside an open document is a remount (F9).
 */
export class RenderBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("hospitality-sidenav: render failed", error, info.componentStack);
    this.props.onError(error instanceof Error ? error : new Error(String(error)));
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
