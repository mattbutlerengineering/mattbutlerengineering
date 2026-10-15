import { Alert, Button, Collapsible, Text } from "@mattbutlerengineering/rialto";
import styles from "./ErrorRetryBanner.module.css";

/* ── Types ───────────────────────────────────── */

export interface ErrorRetryBannerProps {
  /** What did not happen, in the surface's words — "Walk-in not seated." (ux.md § Surface titles). */
  title?: string;
  /** The detail sentence (`describeApiError(err).detail`). Trusted to be a sentence, never a request line. */
  error: string;
  /** The raw request line (`describeApiError(err).raw`), kept behind "Show details". */
  details?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/* ── Component ───────────────────────────────── */

/**
 * The only rendering of an error to a person. `Alert variant="error"` carries `role="alert"`, so
 * the title and detail are announced once, together; Retry, "Show details" and dismiss appear only
 * when the surface supplies them.
 */
export function ErrorRetryBanner({
  title,
  error,
  details,
  onRetry,
  onDismiss,
}: ErrorRetryBannerProps) {
  const hasDetails = details !== undefined && details.trim() !== "";

  return (
    <div className={styles.banner}>
      <Alert
        variant="error"
        title={title}
        dismissible={!!onDismiss}
        onDismiss={onDismiss}
        actions={
          onRetry ? (
            <Button variant="secondary" size="md" onClick={onRetry} className={styles.retry}>
              Retry
            </Button>
          ) : undefined
        }
      >
        {error}
        {hasDetails && (
          <Collapsible trigger="Show details" className={styles.details}>
            <Text variant="caption" color="secondary">
              {details}
            </Text>
          </Collapsible>
        )}
      </Alert>
    </div>
  );
}
