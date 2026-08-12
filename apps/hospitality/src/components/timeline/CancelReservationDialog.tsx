import { useState, useEffect, useCallback, useRef } from "react";
import { Button, Select, TextArea, Stack, Text } from "@mattbutlerengineering/rialto";
import { useEscapeKey, useFocusTrap } from "@mattbutlerengineering/rialto/hooks";
import type { CancellationQuote } from "../../hooks/useCancellationQuote.js";
import styles from "./CancelReservationDialog.module.css";

interface CancelReservationDialogProps {
  reservationId: string;
  guestName: string | null;
  onConfirm: (reason: string, note: string) => Promise<void>;
  onClose: () => void;
  /** Fee quote (evaluated fee + display label). When provided, shows the fee before confirm. */
  quote?: CancellationQuote | null;
}

const CANCELLATION_REASONS = [
  { value: "guest_cancelled", label: "Guest Cancelled" },
  { value: "no_show", label: "No Show" },
  { value: "restaurant_cancelled", label: "Restaurant Cancelled" },
  { value: "other", label: "Other" },
];

export function CancelReservationDialog({
  reservationId: _reservationId,
  guestName,
  onConfirm,
  onClose,
  quote,
}: CancelReservationDialogProps) {
  const [reason, setReason] = useState<string>("guest_cancelled");
  const [note, setNote] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
  }, []);

  const handleClose = useCallback(() => {
    previouslyFocusedRef.current?.focus();
    onClose();
  }, [onClose]);

  useFocusTrap(panelRef, true);
  useEscapeKey(handleClose, true);

  const displayName = guestName ?? "Guest";

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onConfirm(reason, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel reservation.");
      setIsLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
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
        aria-labelledby="cancel-dialog-title"
      >
        <Stack gap="lg">
          <div className={styles.header}>
            <Text variant="display" id="cancel-dialog-title">
              Cancel Reservation
            </Text>
            <Text variant="body" color="secondary">
              Cancelling reservation for <strong>{displayName}</strong>
            </Text>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          {quote && (
            <div
              className={`${styles.feeBanner} ${quote.fee.feeType !== "none" ? styles.feeBannerWarning : ""}`}
              data-testid="cancellation-fee-banner"
            >
              <Text variant="caption">{quote.label}</Text>
            </div>
          )}

          <Stack gap="md">
            <Select
              label="Reason"
              value={reason}
              onChange={setReason}
              options={CANCELLATION_REASONS}
              disabled={isLoading}
            />

            <TextArea
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add any additional context..."
              disabled={isLoading}
            />
          </Stack>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
              Keep Reservation
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              isLoading={isLoading}
              loadingText="Cancelling…"
            >
              Cancel Reservation
            </Button>
          </div>
        </Stack>
      </div>
    </div>
  );
}
