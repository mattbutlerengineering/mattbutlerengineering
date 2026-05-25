import { Alert, Button } from "@mattbutlerengineering/rialto";

/* ── Types ───────────────────────────────────── */

export interface ErrorRetryBannerProps {
  error: string;
  onRetry: () => void;
  onDismiss?: () => void;
}

/* ── Component ───────────────────────────────── */

export function ErrorRetryBanner({ error, onRetry, onDismiss }: ErrorRetryBannerProps) {
  return (
    <div style={{ marginBlock: "var(--rialto-space-md)" }}>
      <Alert
        variant="error"
        dismissible={!!onDismiss}
        onDismiss={onDismiss}
        actions={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    </div>
  );
}
