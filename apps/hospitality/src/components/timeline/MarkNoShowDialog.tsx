import { useRef, useState } from "react";
import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import { useEscapeKey, useFocusTrap } from "@mattbutlerengineering/rialto/hooks";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import { useFocusAfter } from "../../hooks/useFocusAfter.js";
import { describeApiError, type ApiErrorDescription } from "../../lib/describe-api-error.js";
import styles from "./MarkNoShowDialog.module.css";

interface MarkNoShowDialogProps {
  guestName: string | null;
  /** Rejects on failure — the dialog owns showing it (architecture § Dialog contracts). */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Confirms the CONFIRMED → NO_SHOW transition before firing it — the backend
 * (`recordNoShow`, `services/reservations`) captures any held deposit as a
 * no-show fee via the existing Stripe capture path, and that is a real,
 * irreversible charge. Modeled on `CancelReservationDialog`'s "dialog owns
 * its failure" contract: a rejected `onConfirm` becomes an `ErrorRetryBanner`,
 * the dialog stays open, and focus returns to Mark No-Show so pressing again
 * is the retry (safe — the backend transition is idempotent).
 */
export function MarkNoShowDialog({ guestName, onConfirm, onClose }: MarkNoShowDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [failure, setFailure] = useState<ApiErrorDescription | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const { focusAfter } = useFocusAfter();

  useFocusTrap(panelRef, true);
  useEscapeKey(onClose, true);

  const displayName = guestName ?? "Guest";

  const handleConfirm = async () => {
    setIsLoading(true);
    setFailure(null);
    try {
      await onConfirm();
    } catch (err) {
      setFailure(describeApiError(err));
      if (confirmRef.current) focusAfter({ kind: "element", element: confirmRef.current });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    // Escape is handled globally via useEscapeKey; this backdrop click is a
    // pointer-only affordance equivalent to the Keep Reservation button already in the dialog.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={panelRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-no-show-dialog-title"
      >
        <Stack gap="lg">
          <div className={styles.header}>
            <Text variant="display" id="mark-no-show-dialog-title">
              Mark No-Show
            </Text>
            <Text variant="body" color="secondary">
              Marking <strong>{displayName}</strong> as a no-show captures the held deposit as a
              no-show fee. This cannot be undone.
            </Text>
          </div>

          {failure && (
            <ErrorRetryBanner
              title="Reservation not marked as no-show."
              error={failure.detail}
              details={failure.raw}
            />
          )}

          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Keep Reservation
            </Button>
            <Button
              ref={confirmRef}
              variant="primary"
              onClick={() => void handleConfirm()}
              isLoading={isLoading}
              loadingText="Marking…"
            >
              Mark No-Show
            </Button>
          </div>
        </Stack>
      </div>
    </div>
  );
}
