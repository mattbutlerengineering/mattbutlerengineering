import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec, ComponentRegistry } from "@json-render/react";
import { Alert } from "../Alert/Alert.js";
import { Skeleton } from "../Skeleton/Skeleton.js";
import styles from "./CopilotPreview.module.css";

export interface CopilotPreviewProps {
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
  registry: ComponentRegistry;
}

/**
 * Preview area that renders the AI-generated UI spec inside the GenCopilot panel.
 * Wraps Renderer in JSONUIProvider with the consumer-provided registry.
 * Shows loading skeleton on TTFT, error alert, empty state, or the rendered spec.
 * No retry button — consumer unmounts/remounts GenCopilot for a fresh start.
 */
export function CopilotPreview({ spec, isStreaming, error, registry }: CopilotPreviewProps) {
  return (
    <div className={styles.preview}>
      <JSONUIProvider registry={registry}>
        {error ? (
          <div className={styles.stateContainer}>
            <Alert variant="error">
              <span>{error.message}</span>
            </Alert>
          </div>
        ) : isStreaming && !spec ? (
          <div className={styles.stateContainer} aria-label="Generating…" role="status">
            <Skeleton height="1.5rem" />
            <Skeleton height="1.5rem" />
            <Skeleton height="1.5rem" />
          </div>
        ) : !spec && !isStreaming ? (
          <div className={styles.stateContainer}>
            <p className={styles.emptyText}>Enter a prompt to generate UI</p>
          </div>
        ) : (
          <div className={styles.rendererWrapper}>
            <Renderer spec={spec} registry={registry} loading={isStreaming} />
          </div>
        )}
      </JSONUIProvider>
    </div>
  );
}
