import { useState } from "react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { registry } from "@mbe/rialto-catalog";
import { Alert, Button, Text } from "@mbe/rialto";
import styles from "./PreviewPane.module.css";

export interface PreviewPaneProps {
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Set when viewing a saved spec — enables Share and Refine buttons. */
  activeSpecId: string | null;
  /** Called with spec ID when user clicks Share — copies permalink to clipboard. */
  onShare: (id: string) => void;
  /** Called when user clicks Refine — enters refinement mode. */
  onRefine: () => void;
  /** Whether refinement mode is currently active. */
  isRefinementMode: boolean;
}

/**
 * Center column that renders the AI-generated UI spec.
 * Wraps Renderer in JSONUIProvider with the Rialto catalog registry.
 * Shows loading pulse on TTFT, error alert, or empty state placeholder.
 * When a saved spec is active (activeSpecId set), shows Share + Refine controls.
 */
export function PreviewPane({
  spec,
  isStreaming,
  error,
  onRetry,
  activeSpecId,
  onShare,
  onRefine,
  isRefinementMode,
}: PreviewPaneProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleShare(id: string) {
    const url = `${window.location.origin}/gen/s/${id}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      },
      () => {
        // Clipboard API unavailable — fall back to prompt
        window.prompt("Copy this link:", url);
      }
    );
    onShare(id);
  }

  const showActionBar = activeSpecId !== null && !isStreaming;

  return (
    <section className={styles.pane}>
      {showActionBar && (
        <div className={styles.actionBar}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleShare(activeSpecId)}
          >
            {copiedId === activeSpecId ? "Copied!" : "Share"}
          </Button>
          {isRefinementMode ? (
            <Text variant="label" color="secondary">
              Refining...
            </Text>
          ) : (
            <Button variant="ghost" size="sm" onClick={onRefine}>
              Refine
            </Button>
          )}
        </div>
      )}
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
