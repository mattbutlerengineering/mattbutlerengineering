import { useState, useRef } from "react";
import { Button, Select, TextArea, Stack, Text } from "@mattbutlerengineering/rialto";
import { useEscapeKey, useFocusTrap } from "@mattbutlerengineering/rialto/hooks";
import type { CancellationQuote } from "../../hooks/useCancellationQuote.js";
import { ErrorRetryBanner } from "../ErrorRetryBanner.js";
import { useFocusAfter } from "../../hooks/useFocusAfter.js";
import { describeApiError, type ApiErrorDescription } from "../../lib/describe-api-error.js";
import styles from "./CancelReservationDialog.module.css";

interface CancelReservationDialogProps {
  reservationId: string;
  guestName: string | null;
  /** Rejects on failure — the dialog owns showing it (architecture § Dialog contracts). */
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

/**
 * The dialog owns its failure and nothing else: a rejected `onConfirm` becomes an
 * `ErrorRetryBanner` above the actions, the buttons return to rest, reason and note stay, and
 * focus lands back on Cancel Reservation — pressing again is the retry. Focus return on close is
 * the page's (`useFocusAfter`, captured at event time), so there is no restore code here.
 */
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
      await onConfirm(reason, note);
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

          {failure && (
            <ErrorRetryBanner
              title="Reservation not cancelled."
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
