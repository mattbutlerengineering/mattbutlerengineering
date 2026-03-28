import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { registry } from "@mbe/rialto-catalog";
import { Alert, Button } from "@mbe/rialto";
import styles from "./PreviewPane.module.css";

export interface PreviewPaneProps {
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
  onRetry: () => void;
}

/**
 * Center column that renders the AI-generated UI spec.
 * Wraps Renderer in JSONUIProvider with the Rialto catalog registry.
 * Shows loading pulse on TTFT, error alert, or empty state placeholder.
 */
export function PreviewPane({ spec, isStreaming, error, onRetry }: PreviewPaneProps) {
  return (
    <section className={styles.pane}>
      <JSONUIProvider registry={registry}>
        {error ? (
          <div className={styles.errorState}>
            <Alert variant="error">
              <span>{error.message}</span>
            </Alert>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : isStreaming && !spec ? (
          <div className={styles.loadingState}>
            <div className={styles.pulse} aria-label="Generating…" role="status" />
          </div>
        ) : !spec && !isStreaming ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>Enter a prompt to generate UI</p>
          </div>
        ) : (
          <div className={styles.rendererWrapper}>
            <Renderer spec={spec} registry={registry} loading={isStreaming} />
          </div>
        )}
      </JSONUIProvider>
    </section>
  );
}
